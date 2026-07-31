import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

async def check_doctor():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.med_crm_db
    
    doctor_id = "698d87651ae53a49f7996338"
    
    print(f"Ищем врача с ID: {doctor_id}")
    print("=" * 60)
    
    # Попытка 1: поиск по полю id
    doctor1 = await db.doctors.find_one({"id": doctor_id})
    print(f"\n1. Поиск по {{'id': '{doctor_id}'}}:")
    print(f"   Результат: {'НАЙДЕН' if doctor1 else 'НЕ НАЙДЕН'}")
    if doctor1:
        print(f"   Данные: {doctor1}")
    
    # Попытка 2: поиск по _id как строка
    doctor2 = await db.doctors.find_one({"_id": doctor_id})
    print(f"\n2. Поиск по {{'_id': '{doctor_id}'}} (строка):")
    print(f"   Результат: {'НАЙДЕН' if doctor2 else 'НЕ НАЙДЕН'}")
    if doctor2:
        print(f"   Данные: {doctor2}")
    
    # Попытка 3: поиск по _id как ObjectId
    try:
        doctor3 = await db.doctors.find_one({"_id": ObjectId(doctor_id)})
        print(f"\n3. Поиск по {{'_id': ObjectId('{doctor_id}')}}:")
        print(f"   Результат: {'НАЙДЕН' if doctor3 else 'НЕ НАЙДЕН'}")
        if doctor3:
            print(f"   Данные: {doctor3}")
    except Exception as e:
        print(f"\n3. Ошибка при попытке использовать ObjectId: {e}")
    
    # Поиск всех врачей и проверка их ID
    print("\n" + "=" * 60)
    print("Все врачи в БД:")
    all_doctors = await db.doctors.find({"is_active": True}).to_list(100)
    for doc in all_doctors:
        print(f"\nВрач: {doc.get('full_name')}")
        print(f"  _id: {doc.get('_id')} (тип: {type(doc.get('_id'))})")
        print(f"  id: {doc.get('id')} (тип: {type(doc.get('id'))})")
        if str(doc.get('_id')) == doctor_id or doc.get('id') == doctor_id:
            print(f"  >>> ЭТО ИСКОМЫЙ ВРАЧ! <<<")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_doctor())
