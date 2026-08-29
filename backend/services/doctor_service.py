"""
Doctor service - business logic for doctor operations
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException
from datetime import datetime
from typing import List, Optional

from models.doctor import Doctor, DoctorCreate, DoctorUpdate, DoctorSchedule, DoctorWithSchedule


class DoctorService:
    """Service for doctor-related business logic"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    @staticmethod
    def _normalize_specialties(doctor_dict: dict) -> dict:
        """Normalize specialty/specialties fields for backward compatibility.
        
        - If doctor has old `specialty: str` but no `specialties`, convert to list.
        - If both are provided, `specialties` takes priority.
        - If neither is provided, set empty list.
        """
        # If specialties already exists as a non-empty list, use it as-is
        if doctor_dict.get("specialties") and isinstance(doctor_dict["specialties"], list) and len(doctor_dict["specialties"]) > 0:
            # Also populate specialty from first item for backward compat
            if not doctor_dict.get("specialty"):
                doctor_dict["specialty"] = doctor_dict["specialties"][0]
            return doctor_dict
        
        # If specialty exists as a string, convert to specialties list
        if doctor_dict.get("specialty") and isinstance(doctor_dict["specialty"], str):
            if not doctor_dict.get("specialties") or not isinstance(doctor_dict["specialties"], list) or len(doctor_dict["specialties"]) == 0:
                doctor_dict["specialties"] = [doctor_dict["specialty"]]
        else:
            # Neither field is set - provide defaults
            if "specialties" not in doctor_dict or not doctor_dict["specialties"]:
                doctor_dict["specialties"] = []
            if "specialty" not in doctor_dict or not doctor_dict["specialty"]:
                doctor_dict["specialty"] = None
        
        return doctor_dict
    
    async def create_doctor(self, doctor_data: DoctorCreate) -> Doctor:
        """Create a new doctor with validation"""
        doctor_dict = doctor_data.dict()
        
        # Нормализуем specialty/specialties для обратной совместимости
        doctor_dict = self._normalize_specialties(doctor_dict)
        
        # Проверка на дублирование врача по имени И телефону (оба совпадают)
        # Это позволяет иметь врачей с одинаковым именем, но разными телефонами
        existing_doctor = await self.db.doctors.find_one({
            "full_name": doctor_dict["full_name"],
            "phone": doctor_dict["phone"],
            "is_active": True
        })
        
        if existing_doctor:
            raise HTTPException(
                status_code=400, 
                detail=f"Врач '{doctor_dict['full_name']}' с телефоном '{doctor_dict['phone']}' уже существует"
            )
        
        # Дополнительная проверка: если телефон уже используется другим врачом
        phone_exists = await self.db.doctors.find_one({
            "phone": doctor_dict["phone"],
            "is_active": True
        })
        
        if phone_exists and phone_exists["full_name"] != doctor_dict["full_name"]:
            raise HTTPException(
                status_code=400, 
                detail=f"Телефон '{doctor_dict['phone']}' уже используется врачом '{phone_exists['full_name']}'"
            )
        
        # Автоматическое определение payment_mode при создании
        services = doctor_dict.get("services", [])
        
        # Проверяем, есть ли индивидуальные комиссии
        has_individual_commissions = False
        if isinstance(services, list) and services:
            for service in services:
                if isinstance(service, dict) and ("commission_type" in service or "commission_value" in service):
                    has_individual_commissions = True
                    break
        
        # Устанавливаем payment_mode на основе структуры данных
        doctor_dict["payment_mode"] = "individual" if has_individual_commissions else "general"
        
        doctor_obj = Doctor(**doctor_dict)
        await self.db.doctors.insert_one(doctor_obj.dict())
        return doctor_obj
    
    async def get_doctors(self) -> List[Doctor]:
        """Get all active doctors"""
        doctors = await self.db.doctors.find({"is_active": True}).sort("full_name", 1).to_list(1000)
        
        # Исправляем пустые телефоны перед валидацией
        fixed_doctors = []
        for doctor in doctors:
            # ВАЖНО: Используем поле "id" (UUID) если оно существует
            # НЕ перезаписываем его значением _id (MongoDB ObjectId)
            if "_id" in doctor:
                if "id" not in doctor:
                    # Только если id не существует, используем _id
                    doctor["id"] = str(doctor["_id"])
                del doctor["_id"]  # Удаляем _id, чтобы не было конфликтов
            
            # Убедимся что id это строка
            if "id" in doctor and not isinstance(doctor["id"], str):
                doctor["id"] = str(doctor["id"])
            
            # Проверяем и исправляем пустые телефоны
            if not doctor.get("phone") or len(doctor.get("phone", "").replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")) < 10:
                doctor["phone"] = "+7 (000) 000-00-00"
                # Обновляем в БД для будущих запросов  
                if "id" in doctor:
                    await self.db.doctors.update_one(
                        {"id": doctor["id"]},
                        {"$set": {"phone": "+7 (000) 000-00-00"}}
                    )
            
            # Нормализуем specialty/specialties для обратной совместимости
            doctor = self._normalize_specialties(doctor)
            
            fixed_doctors.append(Doctor(**doctor))
        
        return fixed_doctors
    
    async def get_doctor_by_id(self, doctor_id: str) -> Doctor:
        """Get doctor by ID"""
        from bson import ObjectId
        
        # Создаём условия поиска по всем форматам ID
        search_conditions = [
            {"id": doctor_id},
            {"_id": doctor_id}
        ]
        if len(doctor_id) == 24 and all(c in '0123456789abcdef' for c in doctor_id.lower()):
            try:
                search_conditions.append({"_id": ObjectId(doctor_id)})
            except:
                pass
        
        doctor = await self.db.doctors.find_one({"$or": search_conditions})
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")
        
        # Конвертируем _id в строку для модели
        if "_id" in doctor:
            if "id" not in doctor:
                doctor["id"] = str(doctor["_id"])
            del doctor["_id"]
        
        # Нормализуем specialty/specialties для обратной совместимости
        doctor = self._normalize_specialties(doctor)
        
        return Doctor(**doctor)
    
    async def update_doctor(self, doctor_id: str, update_data: DoctorUpdate) -> Doctor:
        """Update doctor with auto payment_mode detection"""
        from bson import ObjectId
        
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        # Нормализуем specialty/specialties для обратной совместимости
        # Если передан specialties, обновляем также specialty (первый элемент)
        if "specialties" in update_dict and update_dict["specialties"] is not None:
            if isinstance(update_dict["specialties"], list) and len(update_dict["specialties"]) > 0:
                update_dict["specialty"] = update_dict["specialties"][0]
            else:
                update_dict["specialty"] = None
        elif "specialty" in update_dict and update_dict["specialty"] is not None:
            # Если передан только specialty, обновляем specialties
            update_dict["specialties"] = [update_dict["specialty"]]

        # Создаём условия поиска для текущего врача по всем форматам ID
        search_conditions = [
            {"id": doctor_id},
            {"_id": doctor_id}
        ]
        # Если doctor_id - валидный ObjectId, добавляем и такой вариант
        if len(doctor_id) == 24 and all(c in '0123456789abcdef' for c in doctor_id.lower()):
            try:
                search_conditions.append({"_id": ObjectId(doctor_id)})
            except:
                pass
        
        # Проверка на дублирование телефона при обновлении
        if "phone" in update_dict:
            # Сначала найдём текущего врача, чтобы узнать его полные данные
            current_doctor = await self.db.doctors.find_one({"$or": search_conditions})
            
            if current_doctor:
                # Ищем врачей с таким же телефоном, исключая текущего по _id
                current_id = current_doctor.get("_id")
                phone_exists = await self.db.doctors.find_one({
                    "phone": update_dict["phone"],
                    "_id": {"$ne": current_id},  # Исключаем текущего врача по _id
                    "is_active": True
                })
                if phone_exists:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Телефон '{update_dict['phone']}' уже используется врачом '{phone_exists['full_name']}'"
                    )
        
        # Автоматическое определение payment_mode на основе структуры services
        if "services" in update_dict and update_dict["services"] is not None:
            services = update_dict["services"]
            
            # Проверяем, есть ли индивидуальные комиссии
            has_individual_commissions = False
            if isinstance(services, list) and services:
                for service in services:
                    if isinstance(service, dict) and ("commission_type" in service or "commission_value" in service):
                        has_individual_commissions = True
                        break
            
            # Устанавливаем payment_mode на основе структуры данных
            update_dict["payment_mode"] = "individual" if has_individual_commissions else "general"
        
        # Обновляем врача по всем возможным форматам ID
        result = await self.db.doctors.update_one(
            {"$or": search_conditions}, 
            {"$set": update_dict}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Doctor not found")
        
        # Находим обновленного врача
        updated_doctor = await self.db.doctors.find_one({"$or": search_conditions})
        
        # Конвертируем _id в строку для модели
        if updated_doctor and "_id" in updated_doctor:
            if "id" not in updated_doctor:
                updated_doctor["id"] = str(updated_doctor["_id"])
            del updated_doctor["_id"]
        
        # Нормализуем specialty/specialties для обратной совместимости
        updated_doctor = self._normalize_specialties(updated_doctor)
        
        return Doctor(**updated_doctor)
    
    async def delete_doctor(self, doctor_id: str) -> dict:
        """Soft delete doctor (mark as inactive)"""
        from bson import ObjectId
        
        # Создаём условия поиска по всем форматам ID
        search_conditions = [
            {"id": doctor_id},
            {"_id": doctor_id}
        ]
        if len(doctor_id) == 24 and all(c in '0123456789abcdef' for c in doctor_id.lower()):
            try:
                search_conditions.append({"_id": ObjectId(doctor_id)})
            except:
                pass
        
        result = await self.db.doctors.update_one(
            {"$or": search_conditions}, 
            {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Doctor not found")
        return {"message": "Doctor deactivated successfully"}
    
    async def get_available_doctors(
        self, 
        appointment_date: str, 
        appointment_time: Optional[str] = None
    ) -> List[DoctorWithSchedule]:
        """Get doctors available on a specific date and optionally time"""
        try:
            # Parse date to get day of week
            date_obj = datetime.strptime(appointment_date, "%Y-%m-%d")
            day_of_week = date_obj.weekday()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        # Get doctors with schedules for this day
        pipeline = [
            {"$match": {"is_active": True}},
            {
                "$lookup": {
                    "from": "doctor_schedules",
                    "localField": "id",
                    "foreignField": "doctor_id",
                    "as": "schedule"
                }
            },
            {
                "$match": {
                    "schedule": {
                        "$elemMatch": {
                            "day_of_week": day_of_week,
                            "is_active": True
                        }
                    }
                }
            }
        ]
        
        available_doctors = []
        doctors = await self.db.doctors.aggregate(pipeline).to_list(None)
        
        for doctor in doctors:
            # Filter schedule for the requested day
            day_schedules = [s for s in doctor["schedule"] if s["day_of_week"] == day_of_week and s["is_active"]]
            
            if appointment_time:
                # Check if appointment time is within working hours
                time_available = False
                try:
                    appointment_time_obj = datetime.strptime(appointment_time, "%H:%M").time()
                    for schedule in day_schedules:
                        start_time_obj = datetime.strptime(schedule["start_time"], "%H:%M").time()
                        end_time_obj = datetime.strptime(schedule["end_time"], "%H:%M").time()
                        if start_time_obj <= appointment_time_obj <= end_time_obj:
                            time_available = True
                            break
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM")
                
                if not time_available:
                    continue
            
            # Нормализуем specialty/specialties для обратной совместимости
            doctor = self._normalize_specialties(doctor)
            
            doctor_with_schedule = DoctorWithSchedule(
                id=doctor["id"],
                full_name=doctor["full_name"],
                specialty=doctor.get("specialty"),
                specialties=doctor.get("specialties", []),
                phone=doctor.get("phone"),
                calendar_color=doctor["calendar_color"],
                is_active=doctor["is_active"],
                user_id=doctor.get("user_id"),
                created_at=doctor["created_at"],
                updated_at=doctor["updated_at"],
                schedule=[DoctorSchedule(**s) for s in day_schedules]
            )
            available_doctors.append(doctor_with_schedule)
        
        return available_doctors
