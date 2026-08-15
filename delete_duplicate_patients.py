#!/usr/bin/env python3
"""
Скрипт для удаления дубликатов пациентов.
Оставляет самую раннюю запись (по created_at), удаляет дубликаты по имени и телефону.
"""

import requests
from collections import defaultdict

BACKEND_URL = "http://localhost:8001"

def login():
    """Логин и получение токена"""
    response = requests.post(
        f"{BACKEND_URL}/api/auth/login",
        json={"email": "alex@mail.ru", "password": "admin"}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    else:
        print(f"Ошибка логина: {response.status_code} - {response.text}")
        return None

def get_patients(token):
    """Получить всех пациентов"""
    response = requests.get(
        f"{BACKEND_URL}/api/patients",
        headers={"Authorization": f"Bearer {token}"}
    )
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Ошибка получения пациентов: {response.status_code}")
        return []

def delete_patient(token, patient_id):
    """Удалить пациента по ID"""
    response = requests.delete(
        f"{BACKEND_URL}/api/patients/{patient_id}",
        headers={"Authorization": f"Bearer {token}"}
    )
    return response.status_code == 200 or response.status_code == 204

def find_duplicates(patients):
    """Найти дубликаты по имени + телефону"""
    # Группируем по ключу (имя + телефон)
    groups = defaultdict(list)
    
    for patient in patients:
        key = (patient.get("full_name", "").strip().lower(), patient.get("phone", "").strip())
        groups[key].append(patient)
    
    duplicates_to_delete = []
    
    for key, group in groups.items():
        if len(group) > 1:
            # Сортируем по дате создания (оставляем самый старый)
            sorted_group = sorted(group, key=lambda x: x.get("created_at", ""))
            # Первый оставляем, остальные - на удаление
            original = sorted_group[0]
            for dup in sorted_group[1:]:
                duplicates_to_delete.append({
                    "to_delete": dup,
                    "original": original
                })
    
    return duplicates_to_delete

def main():
    print("=" * 60)
    print("Удаление дубликатов пациентов")
    print("=" * 60)
    
    # Логин
    print("\n🔐 Авторизация...")
    token = login()
    if not token:
        print("❌ Не удалось авторизоваться")
        return
    print("✅ Авторизация успешна")
    
    # Получаем пациентов
    print("\n📋 Получение списка пациентов...")
    patients = get_patients(token)
    print(f"✅ Найдено пациентов: {len(patients)}")
    
    # Находим дубликаты
    print("\n🔍 Поиск дубликатов...")
    duplicates = find_duplicates(patients)
    
    if not duplicates:
        print("✅ Дубликатов не найдено!")
        return
    
    print(f"⚠️  Найдено дубликатов для удаления: {len(duplicates)}")
    print("\nСписок дубликатов:")
    print("-" * 60)
    
    for i, dup in enumerate(duplicates, 1):
        to_del = dup["to_delete"]
        orig = dup["original"]
        print(f"{i}. УДАЛИТЬ: {to_del['full_name']} ({to_del['phone']}) ID: {to_del['id'][:8]}...")
        print(f"   ОСТАВИТЬ: {orig['full_name']} ({orig['phone']}) ID: {orig['id'][:8]}...")
        print()
    
    # Подтверждение
    confirm = input("\n❓ Удалить эти дубликаты? (yes/no): ").strip().lower()
    
    if confirm != "yes":
        print("❌ Отменено")
        return
    
    # Удаление
    print("\n🗑️  Удаление дубликатов...")
    deleted = 0
    failed = 0
    
    for dup in duplicates:
        patient_id = dup["to_delete"]["id"]
        patient_name = dup["to_delete"]["full_name"]
        
        if delete_patient(token, patient_id):
            print(f"  ✅ Удалён: {patient_name}")
            deleted += 1
        else:
            print(f"  ❌ Ошибка удаления: {patient_name}")
            failed += 1
    
    print("\n" + "=" * 60)
    print(f"✅ Удалено: {deleted}")
    print(f"❌ Ошибок: {failed}")
    print("=" * 60)

if __name__ == "__main__":
    main()
