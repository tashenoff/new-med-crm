from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import List, Optional, Union
from datetime import datetime
from enum import Enum
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid
from bson import ObjectId

# Import appointment models from models module
from models.appointment import (
    AppointmentStatus,
    Appointment,
    AppointmentCreate,
    AppointmentUpdate,
    AppointmentWithDetails
)

# Import auth models and dependencies
from models.auth import UserInDB, UserRole
from dependencies import get_current_active_user, require_role

# Router
appointments_router = APIRouter(prefix="/appointments", tags=["Appointments"])

# Dependency to get database
def get_database() -> AsyncIOMotorDatabase:
    from database import db
    return db

# Additional enums specific to appointments router
class CancelReason(str, Enum):
    patient_request = "patient_request"
    doctor_unavailable = "doctor_unavailable"
    emergency = "emergency"
    other = "other"

# Additional models specific to appointments router
class AppointmentStatusUpdate(BaseModel):
    status: AppointmentStatus
    cancel_reason: Optional[CancelReason] = None
    notes: Optional[str] = None


# Helper functions
async def apply_deposit_to_treatment_plans(patient_id: str, deposit_amount: float, appointment_id: str, db: AsyncIOMotorDatabase):
    """Применить депозит записи к планам лечения пациента"""
    if not deposit_amount or deposit_amount <= 0:
        return
    
    try:
        # Находим все активные планы лечения пациента (не завершенные и не отмененные)
        active_plans = await db.treatment_plans.find({
            "patient_id": patient_id,
            "status": {"$nin": ["completed", "cancelled"]},
            "payment_status": {"$ne": "paid"}  # Только не полностью оплаченные
        }).sort("created_at", 1).to_list(100)  # Сортируем по дате создания, чтобы сначала обработать старые планы
        
        remaining_deposit = deposit_amount
        
        for plan in active_plans:
            if remaining_deposit <= 0:
                break
            
            total_cost = plan.get("total_cost", 0)
            paid_amount = plan.get("paid_amount", 0)
            current_deposit = plan.get("deposit_amount", 0)
            
            # Сколько еще нужно оплатить
            remaining_to_pay = total_cost - paid_amount - current_deposit
            
            if remaining_to_pay <= 0:
                continue
            
            # Сколько депозита применить к этому плану
            deposit_to_apply = min(remaining_deposit, remaining_to_pay)
            remaining_deposit -= deposit_to_apply
            
            # Обновляем план
            new_deposit_amount = current_deposit + deposit_to_apply
            new_total_paid = paid_amount + new_deposit_amount
            
            # Определяем новый статус оплаты
            if new_total_paid >= total_cost:
                new_payment_status = "paid"
            elif new_total_paid > 0:
                new_payment_status = "partially_paid"
            else:
                new_payment_status = "unpaid"
            
            # Добавляем ID записи к плану
            appointment_ids = plan.get("appointment_ids", [])
            if appointment_id not in appointment_ids:
                appointment_ids.append(appointment_id)
            
            await db.treatment_plans.update_one(
                {"id": plan["id"]},
                {"$set": {
                    "deposit_amount": new_deposit_amount,
                    "payment_status": new_payment_status,
                    "appointment_ids": appointment_ids,
                    "updated_at": datetime.utcnow()
                }}
            )
            
            print(f"✅ Депозит {deposit_to_apply}₸ применен к плану лечения {plan['id']} пациента {patient_id}")
        
        if remaining_deposit > 0:
            print(f"ℹ️ Остаток депозита {remaining_deposit}₸ будет применен к следующим планам лечения")
    
    except Exception as e:
        print(f"⚠️ Ошибка при применении депозита к плану лечения: {str(e)}")


async def check_doctor_availability(doctor_id: str, appointment_date: str, appointment_time: str, db: AsyncIOMotorDatabase):
    """Check if doctor is available on the given date and time"""
    try:
        # Parse the date to get day of week (0 = Monday, 6 = Sunday)
        date_obj = datetime.strptime(appointment_date, "%Y-%m-%d")
        day_of_week = date_obj.weekday()  # 0 = Monday, 6 = Sunday
        
        # Get doctor's schedule for this day of week
        schedule = await db.doctor_schedules.find_one({
            "doctor_id": doctor_id,
            "day_of_week": day_of_week,
            "is_active": True
        })
        
        if not schedule:
            return False, f"Врач не работает в этот день недели"
        
        # Check if appointment time is within working hours
        appointment_time_obj = datetime.strptime(appointment_time, "%H:%M").time()
        start_time_obj = datetime.strptime(schedule["start_time"], "%H:%M").time()
        end_time_obj = datetime.strptime(schedule["end_time"], "%H:%M").time()
        
        if not (start_time_obj <= appointment_time_obj <= end_time_obj):
            return False, f"Врач не работает в это время. Рабочие часы: {schedule['start_time']}-{schedule['end_time']}"
        
        return True, "Врач доступен"
        
    except Exception as e:
        return False, f"Ошибка при проверке расписания: {str(e)}"


# Appointment endpoints
@appointments_router.post("", response_model=Appointment)
async def create_appointment(
    appointment: AppointmentCreate,
    current_user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    # Check if patient exists
    # Пациенты могут иметь поле id, или быть старыми без id (только _id)
    try:
        patient = await db.patients.find_one({
            "$or": [
                {"id": appointment.patient_id},
                {"_id": appointment.patient_id},
                {"_id": ObjectId(appointment.patient_id)}  # Try as ObjectId
            ]
        })
    except:
        # If ObjectId conversion fails, search only by string id
        patient = await db.patients.find_one({"id": appointment.patient_id})
    
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Check if doctor exists - check multiple ID formats
    doctor_search_queries = [
        {"id": appointment.doctor_id},
        {"_id": appointment.doctor_id}
    ]
    if len(appointment.doctor_id) == 24:
        try:
            doctor_search_queries.append({"_id": ObjectId(appointment.doctor_id)})
        except:
            pass
    
    doctor = await db.doctors.find_one({
        "$or": doctor_search_queries,
        "is_active": True
    })
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    
    # Patients can only create appointments for themselves
    if current_user.role == UserRole.PATIENT and current_user.patient_id != appointment.patient_id:
        raise HTTPException(status_code=403, detail="You can only create appointments for yourself")
    
    # Check doctor's schedule availability
    is_available, availability_message = await check_doctor_availability(
        appointment.doctor_id, 
        appointment.appointment_date, 
        appointment.appointment_time,
        db
    )
    
    if not is_available:
        raise HTTPException(status_code=400, detail=availability_message)
    
    # Check for time conflicts
    print(f"Checking conflicts for doctor {appointment.doctor_id} on {appointment.appointment_date} at {appointment.appointment_time}")
    existing_appointment = await db.appointments.find_one({
        "doctor_id": appointment.doctor_id,
        "appointment_date": appointment.appointment_date,  # Now both are strings
        "appointment_time": appointment.appointment_time,
        "status": {"$nin": [AppointmentStatus.CANCELLED.value, AppointmentStatus.NO_SHOW.value]}
    })
    
    print(f"Found existing appointment: {existing_appointment}")
    if existing_appointment:
        print(f"Conflict detected with appointment ID: {existing_appointment['id']}")
        raise HTTPException(status_code=400, detail="Time slot already booked")
    
    appointment_dict = appointment.dict()
    appointment_obj = Appointment(**appointment_dict)
    await db.appointments.insert_one(appointment_obj.dict())
    
    # Вычисляем фактическую сумму депозита
    deposit_amount = 0
    if appointment.deposit and appointment.deposit > 0:
        deposit_amount = appointment.deposit
        if appointment.deposit_type == 'percent' and appointment.price:
            deposit_amount = (appointment.price * appointment.deposit) / 100
        
        await apply_deposit_to_treatment_plans(
            patient_id=appointment.patient_id,
            deposit_amount=deposit_amount,
            appointment_id=appointment_obj.id,
            db=db
        )
        print(f"💰 Депозит {deposit_amount}₸ из записи {appointment_obj.id} применен к планам лечения")
    
    # Синхронизируем с CRM - либо обновляем существующий лид, либо создаём новый
    try:
        # Поиск лида по номеру телефона пациента или по ID записи
        patient_phone = patient.get('phone')
        patient_name = patient.get('full_name') or patient.get('name', 'Пациент')
        
        if patient_phone:
            # Ищем лид с таким телефоном
            lead = await db.crm_leads.find_one({
                "phone": {"$regex": patient_phone[-9:]}  # Поиск по последним 9 цифрам
            })
            
            if lead:
                # Обновляем существующий лид с данными о записи
                update_data = {
                    "converted_to_appointment_id": appointment_obj.id,
                    "converted_to_client_id": appointment.patient_id,
                    "appointment_price": appointment.price or 0,
                    "deposit_amount": deposit_amount,
                    "deposit_type": appointment.deposit_type,
                    "status": "contacted",  # Статус "Записан на приём"
                    "updated_at": datetime.utcnow()
                }
                
                await db.crm_leads.update_one(
                    {"id": lead["id"]},
                    {"$set": update_data}
                )
                print(f"✅ Лид {lead['id']} обновлен - статус 'Записан на приём', депозит {deposit_amount}₸")
            else:
                # Создаём новый лид для пациента записанного через календарь
                lead_id = str(uuid.uuid4())
                
                # Определяем источник
                source = appointment.source if hasattr(appointment, 'source') and appointment.source else patient.get('source', 'other')
                source_id = appointment.source_id if hasattr(appointment, 'source_id') and appointment.source_id else patient.get('source_id')
                
                # Разбираем ФИО на части
                name_parts = patient_name.split() if patient_name else []
                first_name = name_parts[0] if len(name_parts) > 0 else ''
                last_name = name_parts[1] if len(name_parts) > 1 else ''
                middle_name = ' '.join(name_parts[2:]) if len(name_parts) > 2 else ''
                
                new_lead = {
                    "id": lead_id,
                    "first_name": first_name,
                    "last_name": last_name,
                    "middle_name": middle_name,
                    "phone": patient_phone,
                    "email": patient.get('email', ''),
                    "source": source,
                    "source_id": source_id,
                    "status": "contacted",  # Статус "Записан на приём"
                    "description": f"Автоматически создан при записи через календарь",
                    "converted_to_client_id": appointment.patient_id,
                    "converted_to_appointment_id": appointment_obj.id,
                    "appointment_price": appointment.price or 0,
                    "deposit_amount": deposit_amount,
                    "deposit_type": appointment.deposit_type,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
                
                await db.crm_leads.insert_one(new_lead)
                print(f"✅ Создан новый лид {lead_id} для пациента {patient_name} - статус 'Записан на приём'")
    except Exception as e:
        print(f"⚠️ Не удалось синхронизировать с CRM: {str(e)}")
    
    # Отправка автоматических уведомлений
    try:
        from services.notification_sender import NotificationSender
        notification_sender = NotificationSender(db)
        
        # Получаем имя пациента
        patient_name = patient.get('full_name') or patient.get('name', 'Пациент')
        
        # Получаем имя врача
        doctor_name = doctor.get('full_name', 'Врач')
        
        # Получаем информацию о кабинете если указан
        cabinet_name = None
        if appointment.room_id:
            room = await db.rooms.find_one({"id": appointment.room_id})
            if room:
                cabinet_name = room.get('name', '')
        
        # Отправляем уведомление о создании записи
        await notification_sender.send_appointment_created_notification(
            patient_phone=patient.get('phone'),
            patient_name=patient_name,
            doctor_name=doctor_name,
            appointment_date=appointment.appointment_date,
            appointment_time=appointment.appointment_time,
            cabinet=cabinet_name
        )
    except Exception as e:
        # Не прерываем создание записи если не удалось отправить уведомление
        print(f"⚠️ Не удалось отправить уведомление: {str(e)}")
    
    return appointment_obj


@appointments_router.get("", response_model=List[AppointmentWithDetails])
async def get_appointments(
    date_from: Optional[str] = None, 
    date_to: Optional[str] = None,
    patient_id: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    try:
        query = {}
        
        # Фильтр по patient_id из query параметра (для модальных окон HMS данных)
        if patient_id:
            query["patient_id"] = patient_id
        # Role-based filtering
        elif current_user.role == UserRole.PATIENT:
            query["patient_id"] = current_user.patient_id
        elif current_user.role == UserRole.DOCTOR:
            # ИСПРАВЛЕНИЕ: Ищем записи по doctor_id и также по _id врача
            # Это нужно для совместимости со старыми записями, где doctor_id мог быть MongoDB _id
            doctor_id = current_user.doctor_id
            if doctor_id:
                # Получаем информацию о враче чтобы найти его _id
                doctor = await db.doctors.find_one({
                    "$or": [
                        {"id": doctor_id},
                        {"_id": doctor_id}
                    ]
                })
                if doctor:
                    # Собираем все возможные ID врача для поиска записей
                    possible_ids = [doctor_id]
                    if doctor.get("_id") and str(doctor["_id"]) != doctor_id:
                        possible_ids.append(str(doctor["_id"]))
                    if doctor.get("id") and doctor["id"] != doctor_id:
                        possible_ids.append(doctor["id"])
                    
                    # Убираем дубликаты
                    possible_ids = list(set(possible_ids))
                    
                    if len(possible_ids) > 1:
                        query["doctor_id"] = {"$in": possible_ids}
                    else:
                        query["doctor_id"] = doctor_id
                else:
                    query["doctor_id"] = doctor_id
            else:
                # Если doctor_id не установлен, используем id пользователя
                query["doctor_id"] = current_user.id
        # Admins can see all appointments
        
        if date_from or date_to:
            date_query = {}
            if date_from:
                date_query["$gte"] = date_from
            if date_to:
                date_query["$lte"] = date_to
            query["appointment_date"] = date_query
        
        # Aggregate appointments with patient and doctor details
        pipeline = [
            {"$match": query},
            # Lookup patients - улучшенная логика
            {
                "$lookup": {
                    "from": "patients",
                    "let": {"patient_id_str": "$patient_id"},
                    "pipeline": [
                        {
                            "$match": {
                                "$expr": {
                                    "$or": [
                                        {"$eq": ["$id", "$$patient_id_str"]},
                                        {"$eq": [{"$toString": "$_id"}, "$$patient_id_str"]}
                                    ]
                                }
                            }
                        },
                        {
                            "$addFields": {
                                "full_name": {"$ifNull": ["$full_name", "$name"]}
                            }
                        },
                        {"$limit": 1}
                    ],
                    "as": "patient"
                }
            },
            # Lookup doctors - улучшенная логика для поддержки разных ID
            {
                "$lookup": {
                    "from": "doctors",
                    "let": {"doctor_id_str": "$doctor_id"},
                    "pipeline": [
                        {
                            "$match": {
                                "$expr": {
                                    "$or": [
                                        {"$eq": ["$id", "$$doctor_id_str"]},
                                        {"$eq": ["$_id", "$$doctor_id_str"]},
                                        {"$eq": [{"$toString": "$_id"}, "$$doctor_id_str"]}
                                    ]
                                }
                            }
                        },
                        {"$limit": 1}
                    ],
                    "as": "doctor"
                }
            },
            # Добавляем фильтры чтобы пропустить записи без пациента или врача
            {
                "$match": {
                    "patient": {"$ne": []},
                    "doctor": {"$ne": []}
                }
            },
            {"$unwind": "$patient"},
            {"$unwind": "$doctor"},
            {
                "$project": {
                    "_id": 0,
                    "id": 1,
                    "patient_id": 1,
                    "doctor_id": 1,
                    "room_id": {"$ifNull": ["$room_id", None]},
                    "appointment_date": 1,
                    "appointment_time": 1,
                    "end_time": {"$ifNull": ["$end_time", None]},
                    "price": {"$ifNull": ["$price", 0]},
                    "deposit_type": {"$ifNull": ["$deposit_type", None]},
                    "deposit": {"$ifNull": ["$deposit", None]},
                    "payment_type_id": {"$ifNull": ["$payment_type_id", None]},
                    "payment_type_name": {"$ifNull": ["$payment_type_name", None]},
                    "source": {"$ifNull": ["$source", None]},
                    "source_id": {"$ifNull": ["$source_id", None]},
                    "status": 1,
                    "reason": {"$ifNull": ["$reason", ""]},
                    "notes": {"$ifNull": ["$notes", ""]},
                    "patient_notes": {"$ifNull": ["$patient_notes", ""]},
                    "created_at": 1,
                    "updated_at": 1,
                    "patient_name": "$patient.full_name",
                    "doctor_name": "$doctor.full_name",
                    "doctor_specialty": {
                        "$ifNull": [
                            {"$arrayElemAt": ["$doctor.specialties", 0]},
                            {"$ifNull": ["$doctor.specialty", ""]}
                        ]
                    },
                    "doctor_color": {"$ifNull": ["$doctor.calendar_color", "#3b82f6"]}
                }
            },
            {"$sort": {"appointment_date": 1, "appointment_time": 1}}
        ]
        
        print(f"🔍 Запрос appointments с query: {query}")
        appointments = await db.appointments.aggregate(pipeline).to_list(length=10000)
        print(f"✅ Загружено {len(appointments)} appointments")
        
        return [AppointmentWithDetails(**appointment) for appointment in appointments]
    
    except Exception as e:
        print(f"❌ Ошибка в get_appointments: {str(e)}")
        print(f"❌ Тип ошибки: {type(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Ошибка при загрузке записей: {str(e)}")


@appointments_router.get("/{appointment_id}", response_model=AppointmentWithDetails)
async def get_appointment(
    appointment_id: str,
    current_user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    pipeline = [
        {"$match": {"id": appointment_id}},
        # Lookup patients
        {
            "$lookup": {
                "from": "patients",
                "let": {"patient_id_str": "$patient_id"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$or": [
                                    {"$eq": ["$id", "$$patient_id_str"]},
                                    {"$eq": [{"$toString": "$_id"}, "$$patient_id_str"]}
                                ]
                            }
                        }
                    },
                    {
                        "$addFields": {
                            "full_name": {"$ifNull": ["$full_name", "$name"]}
                        }
                    }
                ],
                "as": "patient"
            }
        },
        # Lookup doctors - улучшенная логика
        {
            "$lookup": {
                "from": "doctors",
                "let": {"doctor_id_str": "$doctor_id"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$or": [
                                    {"$eq": ["$id", "$$doctor_id_str"]},
                                    {"$eq": ["$_id", "$$doctor_id_str"]},
                                    {"$eq": [{"$toString": "$_id"}, "$$doctor_id_str"]}
                                ]
                            }
                        }
                    },
                    {"$limit": 1}
                ],
                "as": "doctor"
            }
        },
        {"$unwind": "$patient"},
        {"$unwind": "$doctor"},
        {
            "$project": {
                "_id": 0,
                "id": 1,
                "patient_id": 1,
                "doctor_id": 1,
                "room_id": {"$ifNull": ["$room_id", None]},
                "appointment_date": 1,
                "appointment_time": 1,
                "end_time": {"$ifNull": ["$end_time", None]},
                "price": {"$ifNull": ["$price", None]},
                "deposit_type": {"$ifNull": ["$deposit_type", None]},
                "deposit": {"$ifNull": ["$deposit", None]},
                "payment_type_id": {"$ifNull": ["$payment_type_id", None]},
                "payment_type_name": {"$ifNull": ["$payment_type_name", None]},
                "source": {"$ifNull": ["$source", None]},
                "source_id": {"$ifNull": ["$source_id", None]},
                "status": 1,
                "reason": 1,
                "notes": 1,
                "patient_notes": {"$ifNull": ["$patient_notes", None]},
                "created_at": 1,
                "updated_at": 1,
                "patient_name": "$patient.full_name",
                "doctor_name": "$doctor.full_name",
                "doctor_specialty": {
                        "$ifNull": [
                            {"$arrayElemAt": ["$doctor.specialties", 0]},
                            {"$ifNull": ["$doctor.specialty", None]}
                        ]
                    },
                    "doctor_color": "$doctor.calendar_color"
            }
        }
    ]
    
    appointments = await db.appointments.aggregate(pipeline).to_list(1)
    if not appointments:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    appointment = appointments[0]
    
    # Check access rights
    if current_user.role == UserRole.PATIENT and current_user.patient_id != appointment["patient_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    elif current_user.role == UserRole.DOCTOR and current_user.doctor_id != appointment["doctor_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return AppointmentWithDetails(**appointment)


@appointments_router.put("/{appointment_id}", response_model=Appointment)
async def update_appointment(
    appointment_id: str,
    appointment_update: AppointmentUpdate,
    current_user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    # Check if appointment exists
    existing = await db.appointments.find_one({"id": appointment_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    # Check access rights
    if current_user.role == UserRole.PATIENT:
        if current_user.patient_id != existing["patient_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        # Patients can only update limited fields
        allowed_fields = {"reason", "notes"}
        update_dict = {k: v for k, v in appointment_update.dict().items() 
                      if v is not None and k in allowed_fields}
    elif current_user.role == UserRole.DOCTOR:
        if current_user.doctor_id != existing["doctor_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        # Doctors can update more fields but not reassign to other doctors
        update_dict = {k: v for k, v in appointment_update.dict().items() if v is not None}
        if "doctor_id" in update_dict and update_dict["doctor_id"] != current_user.doctor_id:
            del update_dict["doctor_id"]  # Don't allow doctors to reassign appointments
    else:  # Admin
        update_dict = {k: v for k, v in appointment_update.dict().items() if v is not None}
    
    update_dict["updated_at"] = datetime.utcnow()
    
    # Check for time conflicts if updating time/date
    if "appointment_date" in update_dict or "appointment_time" in update_dict or "doctor_id" in update_dict:
        check_date = update_dict.get("appointment_date", existing["appointment_date"])
        check_time = update_dict.get("appointment_time", existing["appointment_time"])
        check_doctor = update_dict.get("doctor_id", existing["doctor_id"])
        
        conflict = await db.appointments.find_one({
            "id": {"$ne": appointment_id},
            "doctor_id": check_doctor,
            "appointment_date": check_date,
            "appointment_time": check_time,
            "status": {"$nin": [AppointmentStatus.CANCELLED.value, AppointmentStatus.NO_SHOW.value]}
        })
        
        if conflict:
            raise HTTPException(status_code=400, detail="Time slot already booked")
    
    result = await db.appointments.update_one(
        {"id": appointment_id}, 
        {"$set": update_dict}
    )
    
    updated_appointment = await db.appointments.find_one({"id": appointment_id})
    
    # Синхронизация статуса лида в CRM при изменении статуса записи
    if "status" in update_dict:
        try:
            from crm.services.lead_service import LeadService
            lead_service = LeadService(db)
            await lead_service.sync_lead_from_appointment_status(
                patient_id=updated_appointment["patient_id"],
                appointment_status=update_dict["status"],
                appointment_id=appointment_id
            )
        except Exception as e:
            print(f"⚠️ Не удалось синхронизировать статус лида: {str(e)}")
    
    return Appointment(**updated_appointment)


@appointments_router.patch("/{appointment_id}/status", response_model=Appointment)
async def update_appointment_status(
    appointment_id: str,
    status_update: AppointmentStatusUpdate,
    current_user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Обновить только статус записи"""
    existing = await db.appointments.find_one({"id": appointment_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Appointment not found")

    update_dict = status_update.model_dump(exclude_none=True)
    update_dict["updated_at"] = datetime.utcnow()

    result = await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": update_dict}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")

    updated_appointment = await db.appointments.find_one({"id": appointment_id})

    # Синхронизация статуса лида в CRM при изменении статуса записи
    if "status" in update_dict:
        try:
            from crm.services.lead_service import LeadService
            lead_service = LeadService(db)
            await lead_service.sync_lead_from_appointment_status(
                patient_id=updated_appointment["patient_id"],
                appointment_status=update_dict["status"],
                appointment_id=appointment_id
            )
        except Exception as e:
            print(f"⚠️ Не удалось синхронизировать статус лида: {str(e)}")

    return Appointment(**updated_appointment)


@appointments_router.delete("/{appointment_id}")
async def delete_appointment(
    appointment_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    result = await db.appointments.delete_one({"id": appointment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"message": "Appointment deleted successfully"}
