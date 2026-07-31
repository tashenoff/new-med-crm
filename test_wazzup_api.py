"""
Тестовый скрипт для изучения API Wazzup24
"""
import requests
import json

API_KEY = "4250fedcde354324ae24bb2b68bead73"
BASE_URL = "https://api.wazzup24.com/v3"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

print("🔍 Изучаем API Wazzup24...")
print(f"API Key: {API_KEY}")
print(f"Base URL: {BASE_URL}")
print("-" * 60)

# Тест 1: Проверка доступности API
print("\n1️⃣ Тест: GET /")
try:
    response = requests.get(BASE_URL, headers=headers, timeout=10)
    print(f"Статус: {response.status_code}")
    print(f"Ответ: {response.text[:500]}")
except Exception as e:
    print(f"Ошибка: {e}")

# Тест 2: Получить список каналов
print("\n2️⃣ Тест: GET /channels")
try:
    response = requests.get(f"{BASE_URL}/channels", headers=headers, timeout=10)
    print(f"Статус: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Ответ: {json.dumps(data, indent=2, ensure_ascii=False)}")
    else:
        print(f"Ответ: {response.text}")
except Exception as e:
    print(f"Ошибка: {e}")

# Тест 3: Проверка эндпоинта для отправки сообщений
print("\n3️⃣ Тест: POST /messages")
try:
    test_message = {
        "chatId": "77781647391@c.us",  # Тестовый формат chatId для WhatsApp
        "chatType": "whatsapp",
        "text": "Тест"
    }
    response = requests.post(f"{BASE_URL}/messages", headers=headers, json=test_message, timeout=10)
    print(f"Статус: {response.status_code}")
    print(f"Ответ: {response.text[:500]}")
except Exception as e:
    print(f"Ошибка: {e}")

# Тест 4: Альтернативный эндпоинт
print("\n4️⃣ Тест: POST /message/send")
try:
    response = requests.post(f"{BASE_URL}/message/send", headers=headers, json=test_message, timeout=10)
    print(f"Статус: {response.status_code}")
    print(f"Ответ: {response.text[:500]}")
except Exception as e:
    print(f"Ошибка: {e}")

# Тест 5: Получить контакты
print("\n5️⃣ Тест: GET /contacts")
try:
    response = requests.get(f"{BASE_URL}/contacts", headers=headers, timeout=10)
    print(f"Статус: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Ответ: {json.dumps(data, indent=2, ensure_ascii=False)[:500]}")
    else:
        print(f"Ответ: {response.text}")
except Exception as e:
    print(f"Ошибка: {e}")

# Тест 6: Проверка авторизации
print("\n6️⃣ Тест: Проверка авторизации")
try:
    # Пробуем без токена
    response = requests.get(f"{BASE_URL}/channels", timeout=10)
    print(f"Без токена - Статус: {response.status_code}")
    
    # С токеном
    response = requests.get(f"{BASE_URL}/channels", headers=headers, timeout=10)
    print(f"С токеном - Статус: {response.status_code}")
except Exception as e:
    print(f"Ошибка: {e}")

print("\n" + "=" * 60)
print("✅ Тестирование завершено!")
print("\nРекомендации:")
print("1. Проверьте официальную документацию: https://wazzup24.com/knowledge-base/")
print("2. Возможно нужно использовать другую версию API")
print("3. Убедитесь что API ключ активен в вашем кабинете Wazzup24")
