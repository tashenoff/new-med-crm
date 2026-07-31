import requests
import json

BASE_URL = "http://localhost:8001/api"

# Логин
login_data = {
    "email": "alex@mail.ru",
    "password": "admin"
}

response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
if response.status_code != 200:
    print(f"Ошибка авторизации: {response.status_code}")
    print(response.text)
    exit(1)

auth_response = response.json()
token = auth_response.get("access_token") or auth_response.get("token")
if not token:
    print(f"Токен не найден в ответе: {auth_response}")
    exit(1)

headers = {"Authorization": f"Bearer {token}"}

# Получаем список пациентов
print("=== ПАЦИЕНТЫ ===")
patients = requests.get(f"{BASE_URL}/patients", headers=headers).json()
print(f"Всего пациентов: {len(patients)}")
if patients:
    print(f"Первый пациент: id={patients[0].get('id') or patients[0].get('_id')}, name={patients[0].get('full_name')}")

# Получаем список докторов  
print("\n=== ДОКТОРА ===")
doctors = requests.get(f"{BASE_URL}/doctors", headers=headers).json()
print(f"Всего докторов: {len(doctors)}")
if doctors:
    print(f"Первый доктор: id={doctors[0].get('id') or doctors[0].get('_id')}, name={doctors[0].get('full_name')}")

# Пробуем создать запись
if patients and doctors:
    print("\n=== СОЗДАНИЕ ЗАПИСИ ===")
    appointment_data = {
        "patient_id": patients[0].get('id') or patients[0].get('_id'),
        "doctor_id": doctors[0].get('id') or doctors[0].get('_id'),
        "appointment_date": "2026-02-15",
        "appointment_time": "10:00",
        "end_time": "10:30",
        "status": "unconfirmed",
        "reason": "Тест",
        "notes": "",
        "price": 0
    }
    
    print(f"Данные записи: {json.dumps(appointment_data, indent=2, ensure_ascii=False)}")
    
    response = requests.post(f"{BASE_URL}/appointments", json=appointment_data, headers=headers)
    print(f"\nСтатус: {response.status_code}")
    print(f"Ответ: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
else:
    print("\n⚠️ Нет пациентов или докторов в базе!")
