from pymongo import MongoClient

# Подключение к MongoDB
MONGO_URL = "mongodb://admin:admin123@localhost:27017/?authSource=admin"
DB_NAME = "medcrm"

client = MongoClient(MONGO_URL)
db = client[DB_NAME]
patients_collection = db['patients']

# Подсчет пациентов
total = patients_collection.count_documents({})
print(f"📊 Всего пациентов в базе: {total}")

# Показать несколько примеров
print("\n📋 Примеры записей:")
print("-" * 80)
for patient in patients_collection.find().limit(5):
    print(f"\nID: {patient.get('_id')}")
    print(f"  FirstName: {patient.get('FirstName', 'НЕТ')}")
    print(f"  Phone: {patient.get('Phone', 'НЕТ')}")
    print(f"  DateOfBirth: {patient.get('DateOfBirth', 'НЕТ')}")
    print(f"  IIN: {patient.get('iin', 'НЕТ')}")
    print(f"  External ID: {patient.get('external_id', 'НЕТ')}")

# Проверка полей
sample = patients_collection.find_one()
if sample:
    print("\n🔍 Все поля в одной записи:")
    print("-" * 80)
    for key, value in sample.items():
        print(f"  {key}: {value}")

client.close()
