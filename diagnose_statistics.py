"""
Диагностика проблемы со статистикой врачей
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def diagnose():
    client = AsyncIOMotorClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db = client.medcrm
    
    # 1. Проверим врачей
    print("\n=== ВРАЧИ В БАЗЕ ===")
    doctors = await db.doctors.find({"is_active": True}).to_list(None)
    print(f"Всего активных врачей: {len(doctors)}")
    for doc in doctors[:5]:
        print(f"  - _id: {doc.get('_id')}, id: {doc.get('id')}, name: {doc.get('full_name')}")
    
    # 2. Проверим записи
    print("\n=== ПРИЕМЫ В БАЗЕ ===")
    appointments = await db.appointments.find({}).to_list(None)
    print(f"Всего приемов: {len(appointments)}")
    
    # Соберем уникальные doctor_id из записей
    doctor_ids_in_appointments = set()
    for appt in appointments:
        doctor_id = appt.get('doctor_id')
        if doctor_id:
            doctor_ids_in_appointments.add(str(doctor_id))
    
    print(f"\nУникальные doctor_id в записях: {len(doctor_ids_in_appointments)}")
    for did in list(doctor_ids_in_appointments)[:5]:
        print(f"  - {did}")
    
    # 3. Проверим соответствие
    print("\n=== ПРОВЕРКА СООТВЕТСТВИЯ ===")
    doctor_ids_set = {doc.get('id') for doc in doctors}
    doctor_object_ids_set = {str(doc.get('_id')) for doc in doctors}
    
    print(f"Поля id врачей: {len(doctor_ids_set)}")
    print(f"Поля _id врачей: {len(doctor_object_ids_set)}")
    
    # Проверяем совпадения
    matched_by_id = doctor_ids_in_appointments & doctor_ids_set
    matched_by_object_id = doctor_ids_in_appointments & doctor_object_ids_set
    
    print(f"\nСовпадения по полю 'id': {len(matched_by_id)}")
    print(f"Совпадения по полю '_id': {len(matched_by_object_id)}")
    
    # 4. Покажем пример несовпадающих записей
    print("\n=== НЕСОВПАДАЮЩИЕ ЗАПИСИ ===")
    not_matched = doctor_ids_in_appointments - doctor_ids_set - doctor_object_ids_set
    print(f"doctor_id в записях, не найденные среди врачей: {len(not_matched)}")
    for nm in list(not_matched)[:5]:
        print(f"  - {nm}")
    
    # 5. Проверим статусы записей
    print("\n=== СТАТУСЫ ЗАПИСЕЙ ===")
    status_counts = {}
    for appt in appointments:
        status = appt.get('status', 'unknown')
        status_counts[status] = status_counts.get(status, 0) + 1
    for status, count in status_counts.items():
        print(f"  - {status}: {count}")
    
    # 6. Проверим цены записей
    print("\n=== ЦЕНЫ ЗАПИСЕЙ ===")
    prices = [appt.get('price') for appt in appointments if appt.get('price')]
    print(f"Записей с ценой: {len(prices)}")
    if prices:
        print(f"Примеры цен: {prices[:5]}")
    
    # 7. Детально по каждому врачу
    print("\n=== ДЕТАЛЬНО ПО ВРАЧАМ ===")
    for doc in doctors:
        doc_id = doc.get('id')
        doc_name = doc.get('full_name')
        doc_appts = [a for a in appointments if str(a.get('doctor_id')) == str(doc_id)]
        completed = [a for a in doc_appts if a.get('status') == 'completed']
        print(f"\n{doc_name} (id: {doc_id}):")
        print(f"  - Всего приемов: {len(doc_appts)}")
        print(f"  - Завершенных: {len(completed)}")
        for a in doc_appts:
            print(f"    * status={a.get('status')}, price={a.get('price')}, date={a.get('appointment_date')}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(diagnose())
