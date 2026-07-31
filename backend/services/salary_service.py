"""
Salary service - complex salary calculation logic for doctors
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from typing import Optional, List, Dict, Any


class SalaryService:
    """Service for doctor salary calculations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def get_doctor_salary_report(
        self,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Получить отчет по зарплатам врачей с учетом записей и планов лечения
        Сложная логика расчета комиссий
        """
        # Устанавливаем даты по умолчанию (текущий месяц)
        if not date_from:
            date_from = datetime.now().replace(day=1).strftime('%Y-%m-%d')
        if not date_to:
            date_to = datetime.now().strftime('%Y-%m-%d')
        
        # Конвертируем строки в datetime объекты для MongoDB запросов
        date_from_dt = datetime.strptime(date_from, '%Y-%m-%d')
        date_to_dt = datetime.strptime(date_to, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
        
        # Получаем всех активных врачей
        doctors = await self.db.doctors.find({"is_active": True}).to_list(None)
        
        salary_data = []
        
        for doctor in doctors:
            doctor_id = doctor["id"]
            
            # 1. Выручка с записей на прием
            appointments_revenue, total_appointments = await self._calculate_appointments_revenue(
                doctor_id, date_from_dt, date_to_dt
            )
            
            # 2. Выручка и зарплата с планов лечения
            treatment_plans_revenue, treatment_plans_salary = await self._calculate_treatment_plans_salary(
                doctor, doctor_id, date_from_dt, date_to_dt
            )
            
            # 3. Общая выручка врача
            total_revenue = appointments_revenue + treatment_plans_revenue
            
            # 4. Расчет зарплаты за консультации
            consultations_salary = self._calculate_consultations_salary(
                doctor, appointments_revenue, total_appointments
            )
            
            # 5. Общая зарплата
            calculated_salary = treatment_plans_salary + consultations_salary
            
            # 6. Формируем данные врача
            salary_item = self._build_salary_item(
                doctor, 
                total_appointments,
                appointments_revenue,
                treatment_plans_revenue,
                total_revenue,
                consultations_salary,
                treatment_plans_salary,
                calculated_salary
            )
            
            salary_data.append(salary_item)
        
        # Сортируем по общей выручке
        salary_data.sort(key=lambda x: x["total_revenue"], reverse=True)
        
        # Общая статистика
        summary = self._calculate_summary(salary_data, date_from, date_to)
        
        return {
            "salary_data": salary_data,
            "summary": summary
        }
    
    async def _calculate_appointments_revenue(
        self, 
        doctor_id: str, 
        date_from_dt: datetime, 
        date_to_dt: datetime
    ) -> tuple:
        """Рассчитать выручку с записей на прием"""
        appointments_pipeline = [
            {
                "$match": {
                    "doctor_id": doctor_id,
                    "appointment_date": {"$gte": date_from_dt, "$lte": date_to_dt},
                    "status": "completed"
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total_appointments": {"$sum": 1},
                    "total_revenue": {
                        "$sum": {"$toDouble": {"$ifNull": ["$price", 0]}}
                    }
                }
            }
        ]
        
        appointment_stats = await self.db.appointments.aggregate(appointments_pipeline).to_list(1)
        total_appointments = appointment_stats[0]["total_appointments"] if appointment_stats else 0
        appointments_revenue = appointment_stats[0]["total_revenue"] if appointment_stats else 0.0
        
        return appointments_revenue, total_appointments
    
    async def _calculate_treatment_plans_salary(
        self,
        doctor: dict,
        doctor_id: str,
        date_from_dt: datetime,
        date_to_dt: datetime
    ) -> tuple:
        """Рассчитать выручку и зарплату с планов лечения"""
        treatment_plans_revenue = 0.0
        treatment_plans_salary = 0.0
        doctor_services = doctor.get("services", [])
        
        if not doctor_services:
            return treatment_plans_revenue, treatment_plans_salary
        
        # Обрабатываем режим оплаты врача
        payment_mode = doctor.get("payment_mode", "general")
        service_commissions = {}
        service_ids = []
        
        if doctor_services and len(doctor_services) > 0:
            if payment_mode == "individual" and isinstance(doctor_services[0], dict):
                # Индивидуальный режим: массив объектов с настройками комиссий
                for service_config in doctor_services:
                    service_id = service_config.get("service_id")
                    if service_id:
                        service_ids.append(service_id)
                        service_commissions[service_id] = {
                            "type": service_config.get("commission_type", "percentage"),
                            "value": service_config.get("commission_value", 0),
                            "currency": service_config.get("commission_currency", "KZT")
                        }
            else:
                # Общий режим: массив строк (ID услуг) или старый формат
                if isinstance(doctor_services[0], dict):
                    service_ids = [s.get("service_id") for s in doctor_services if s.get("service_id")]
                else:
                    service_ids = doctor_services
                
                # Используем общие настройки врача для всех услуг
                for service_id in service_ids:
                    service_commissions[service_id] = {
                        "type": doctor.get("payment_type", "percentage"),
                        "value": doctor.get("payment_value", 0),
                        "currency": doctor.get("currency", "KZT")
                    }
        
        if service_ids:
            # Получаем оплаченные планы лечения в периоде
            treatment_plans = await self.db.treatment_plans.find({
                "payment_status": "paid",
                "$or": [
                    {"payment_date": {"$gte": date_from_dt, "$lte": date_to_dt}},
                    {
                        "payment_date": {"$in": [None, ""]},
                        "created_at": {"$gte": date_from_dt, "$lte": date_to_dt}
                    }
                ]
            }).to_list(None)
            
            for plan in treatment_plans:
                # ВАЖНО: Проверяем, назначен ли план этому врачу
                plan_doctor_id = plan.get("assigned_doctor_id") or plan.get("doctor_id")
                
                if plan_doctor_id and plan_doctor_id != doctor_id:
                    continue
                
                if not plan_doctor_id:
                    continue
                
                plan_services = plan.get("services", [])
                # Рассчитываем долю врача в плане лечения
                for service in plan_services:
                    service_id = service.get("service_id") or service.get("id") or service.get("serviceId")
                    
                    if service_id and service_id in service_ids:
                        service_price = service.get("price", 0) * service.get("quantity", 1)
                        discount = service.get("discount", 0)
                        service_price = service_price * (1 - discount / 100)
                        treatment_plans_revenue += service_price
                        
                        # Рассчитываем комиссию для этой конкретной услуги
                        commission_config = service_commissions.get(service_id, {})
                        if commission_config.get("type") == "fixed":
                            service_quantity = service.get("quantity", 1)
                            treatment_plans_salary += commission_config.get("value", 0) * service_quantity
                        else:
                            commission_percent = commission_config.get("value", 0)
                            treatment_plans_salary += service_price * (commission_percent / 100)
        
        return treatment_plans_revenue, treatment_plans_salary
    
    def _calculate_consultations_salary(
        self,
        doctor: dict,
        appointments_revenue: float,
        total_appointments: int
    ) -> float:
        """Рассчитать зарплату за консультации"""
        payment_type = doctor.get("payment_type", "percentage")
        payment_value = doctor.get("payment_value", 0.0)
        consultation_payment_type = doctor.get("consultation_payment_type", "percentage")
        consultation_payment_value = doctor.get("consultation_payment_value", 0.0)
        
        # Проверяем, есть ли у врача настройки комиссий за консультации
        has_consultation_settings = (
            doctor.get("consultation_payment_type") is not None or 
            doctor.get("consultation_payment_value", 0) > 0
        )
        
        if has_consultation_settings:
            if consultation_payment_type == "hybrid":
                return (
                    (consultation_payment_value or 0) +
                    appointments_revenue * ((doctor.get("consultation_hybrid_percentage_value", 0) or 0) / 100)
                )
            elif consultation_payment_type == "fixed":
                return consultation_payment_value * total_appointments
            else:
                return appointments_revenue * (consultation_payment_value / 100)
        else:
            # Используем общие настройки врача
            if payment_type == "fixed":
                return payment_value * total_appointments if total_appointments > 0 else 0
            else:
                return appointments_revenue * (payment_value / 100)
    
    def _build_salary_item(
        self,
        doctor: dict,
        total_appointments: int,
        appointments_revenue: float,
        treatment_plans_revenue: float,
        total_revenue: float,
        consultations_salary: float,
        treatment_plans_salary: float,
        calculated_salary: float
    ) -> Dict[str, Any]:
        """Собрать данные о зарплате врача"""
        doctor_services = doctor.get("services", [])
        
        return {
            "doctor_id": doctor["id"],
            "doctor_name": doctor["full_name"],
            "doctor_specialty": doctor["specialty"],
            # Настройки оплаты за планы лечения
            "payment_type": doctor.get("payment_type", "percentage"),
            "payment_value": doctor.get("payment_value", 0.0),
            "currency": doctor.get("currency", "KZT"),
            # Настройки оплаты за консультации
            "consultation_payment_type": doctor.get("consultation_payment_type", "percentage"),
            "consultation_payment_value": doctor.get("consultation_payment_value", 0.0),
            "consultation_currency": doctor.get("consultation_currency", "KZT"),
            # Статистика
            "total_appointments": total_appointments,
            "completed_appointments": total_appointments,
            "appointments_revenue": appointments_revenue,
            "treatment_plans_revenue": treatment_plans_revenue,
            "total_revenue": total_revenue,
            # Детализация зарплаты по источникам
            "consultations_salary": consultations_salary,
            "treatment_plans_salary": treatment_plans_salary,
            "calculated_salary": calculated_salary,
            "total_salary": calculated_salary,
            "has_services": len(doctor_services) > 0,
            "services_count": len(doctor_services),
            # Детализация гибридных начислений
            "hybrid_fixed_amount": doctor.get("hybrid_fixed_amount", 0),
            "hybrid_percentage_value": doctor.get("hybrid_percentage_value", 0),
            "consultation_hybrid_fixed_amount": doctor.get("consultation_payment_value", 0),
            "consultation_hybrid_percentage_value": doctor.get("consultation_hybrid_percentage_value", 0)
        }
    
    def _calculate_summary(
        self,
        salary_data: List[Dict[str, Any]],
        date_from: str,
        date_to: str
    ) -> Dict[str, Any]:
        """Рассчитать общую статистику"""
        total_revenue = sum(item["total_revenue"] for item in salary_data)
        total_salary = sum(item["calculated_salary"] for item in salary_data)
        total_doctors = len(salary_data)
        
        return {
            "total_revenue": total_revenue,
            "total_salary": total_salary,
            "total_doctors": total_doctors,
            "date_from": date_from,
            "date_to": date_to,
            "salary_percentage": round((total_salary / total_revenue * 100) if total_revenue > 0 else 0, 2)
        }
