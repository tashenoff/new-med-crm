"""
Скрипт для проверки записей из CRM
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from pprint import pprint

async def check_appointments():
    # Подключение к MongoDB с аутентификацией
    client = AsyncIOMotorClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db = client["medcrm"]
    
    # Получаем последние записи на прием
    print("\n=== Последние 5 записей на прием ===")
    appointments = await db.appointments.find().sort("created_at", -1).limit(5).to_list(length=5)
    
    for apt in appointments:
        print("\n---")
        print(f"ID: {apt.get('id', apt.get('_id'))}")
        print(f"Дата: {apt.get('appointment_date')}")
        print(f"Время начала: {apt.get('appointment_time')}")
        print(f"Время окончания: {apt.get('end_time')}")
        print(f"Врач ID: {apt.get('doctor_id')}")
        print(f"Пациент ID: {apt.get('patient_id')}")
        print(f"Кабинет ID: {apt.get('room_id')}")
        print(f"Статус: {apt.get('status')}")
        print(f"Причина: {apt.get('reason')}")
        print(f"Заметки: {apt.get('notes')}")
        print(f"Создано: {apt.get('created_at')}")
    
    # Проверим пациентов из CRM (source = crm_conversion)
    print("\n=== Пациенты из CRM ===")
    crm_patients = await db.patients.find({"source": "crm_conversion"}).sort("created_at", -1).limit(5).to_list(length=5)
    
    for patient in crm_patients:
        print("\n---")
        print(f"ID: {patient.get('id')}")
        print(f"ФИО: {patient.get('full_name')}")
        print(f"Телефон: {patient.get('phone')}")
        print(f"CRM Lead ID: {patient.get('crm_client_id')}")
        print(f"Создано: {patient.get('created_at')}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_appointments())
