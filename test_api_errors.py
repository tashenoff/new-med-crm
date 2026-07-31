"""
Тест API для проверки детальных ошибок
"""

import requests
import json

BASE_URL = "http://localhost:8001/api"

# Логин
print("=" * 60)
print("1. ЛОГИН")
print("=" * 60)

login_data = {"email": "admin@example.com", "password": "admin123"}
response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
print(f"Статус: {response.status_code}")

if response.status_code ==  200:
    data = response.json()
    token = data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("✅ Логин успешен\n")
    
    # Тестируем API врачей
    print("=" * 60)
    print("2. ПОЛУЧЕНИЕ ВРАЧЕЙ")
    print("=" * 60)
    response = requests.get(f"{BASE_URL}/doctors", headers=headers)
    print(f"Статус: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    print()
    
    # Тестируем API пациентов
    print("=" * 60)
    print("3. ПОЛУЧЕНИЕ ПАЦИЕНТОВ") 
    print("=" * 60)
    response = requests.get(f"{BASE_URL}/patients", headers=headers)
    print(f"Статус: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    print()
    
    # Тестируем API комнат
    print("=" * 60)
    print("4. ПОЛУЧЕНИЕ КОМНАТ")
    print("=" * 60)
    response = requests.get(f"{BASE_URL}/rooms-with-schedule", headers=headers)
    print(f"Статус: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    print()
    
else:
    print(f"❌ Ошибка логина: {response.text}")
