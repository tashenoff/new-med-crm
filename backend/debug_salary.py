#!/usr/bin/env python3
"""
Отладка расчета зарплаты врача
"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

# Получаем настройки из переменных окружения
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'medcenter')

async def debug_doctor_salary():
    """Отладка расчета зарплаты конкретного врача"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        # Находим врача по имени
        doctor = await db.doctors.find_one({"full_name": {"$regex": "врач", "$options": "i"}})
        if not doctor:
            print("❌ Врач не найден")
            return
            
        print(f"👨‍⚕️ Врач: {doctor['full_name']}")
        print(f"📋 Услуги врача: {doctor.get('services', [])}")
        print(f"💰 Тип оплаты: {doctor.get('payment_type')} ({doctor.get('payment_value')}%)")
        print("")
        
        # Настройки периода
        date_from = "2025-09-01"
        date_to = "2025-09-30"
        
        # Находим оплаченные планы в периоде
        treatment_plans = await db.treatment_plans.find({
            "payment_status": "paid",
            "payment_date": {"$gte": date_from, "$lte": date_to}
        }).to_list(None)
        
        print(f"📋 Оплаченных планов в периоде: {len(treatment_plans)}")
        
        doctor_services = doctor.get("services", [])
        treatment_plans_revenue = 0.0
        
        for i, plan in enumerate(treatment_plans):
            print(f"\n📋 План {i+1}: {plan.get('title', 'Без названия')}")
            print(f"   💰 Сумма плана: {plan.get('total_cost', 0)} ₸")
            print(f"   📅 Дата оплаты: {plan.get('payment_date')}")
            print(f"   🏥 Пациент: {plan.get('patient_id')}")
            
            plan_services = plan.get("services", [])
            print(f"   📋 Услуг в плане: {len(plan_services)}")
            
            plan_revenue_for_doctor = 0.0
            
            for j, service in enumerate(plan_services):
                service_id = service.get("service_id") or service.get("id") or service.get("serviceId")
                service_name = service.get("service_name", "Без названия")
                service_price = service.get("price", 0)
                quantity = service.get("quantity", 1)
                discount = service.get("discount", 0)
                
                final_price = service_price * quantity * (1 - discount / 100)
                
                print(f"      {j+1}. {service_name}")
                print(f"         ID: {service_id}")
                print(f"         Цена: {service_price} × {quantity} = {service_price * quantity} ₸")
                if discount > 0:
                    print(f"         Скидка: {discount}% → {final_price} ₸")
                
                # Проверяем совпадение с услугами врача
                if service_id and service_id in doctor_services:
                    print(f"         ✅ СОВПАДАЕТ с услугами врача!")
                    plan_revenue_for_doctor += final_price
                    treatment_plans_revenue += final_price
                else:
                    print(f"         ❌ НЕ СОВПАДАЕТ с услугами врача")
                    print(f"             Услуги врача: {doctor_services}")
            
            print(f"   💰 Выручка врача с этого плана: {plan_revenue_for_doctor} ₸")
        
        print(f"\n💰 ИТОГО выручка врача с планов: {treatment_plans_revenue} ₸")
        
        # Расчет зарплаты
        calculated_salary = treatment_plans_revenue * (doctor.get('payment_value', 0) / 100)
        print(f"💸 Зарплата ({doctor.get('payment_value')}%): {calculated_salary} ₸")
        
    except Exception as e:
        print(f"❌ Ошибка: {str(e)}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(debug_doctor_salary())
