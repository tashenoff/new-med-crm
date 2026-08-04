"""
Тестирование функционала "Запомнить меня" при авторизации
"""

import requests
import jwt
from datetime import datetime, timedelta

BACKEND_URL = "http://localhost:8000"
API = f"{BACKEND_URL}/api"

def decode_token_expiry(token):
    """Декодировать токен и получить время истечения"""
    try:
        # Декодируем без проверки подписи чтобы увидеть payload
        decoded = jwt.decode(token, options={"verify_signature": False})
        exp_timestamp = decoded.get("exp")
        if exp_timestamp:
            exp_date = datetime.fromtimestamp(exp_timestamp)
            days_until_expiry = (exp_date - datetime.now()).days
            return exp_date, days_until_expiry
        return None, None
    except Exception as e:
        print(f"Ошибка декодирования токена: {e}")
        return None, None


def test_login_without_remember_me():
    """Тест авторизации БЕЗ 'Запомнить меня'"""
    print("\n" + "="*60)
    print("ТЕСТ 1: Авторизация БЕЗ 'Запомнить меня'")
    print("="*60)
    
    response = requests.post(f"{API}/auth/login", json={
        "email": "admin@admin.com",
        "password": "admin123",
        "remember_me": False
    })
    
    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        print(f"✅ Авторизация успешна!")
        print(f"   Пользователь: {data.get('user', {}).get('email')}")
        
        exp_date, days = decode_token_expiry(token)
        if exp_date:
            print(f"   Токен истекает: {exp_date}")
            print(f"   Дней до истечения: {days}")
            
            if days < 1:
                print(f"   ✅ КОРРЕКТНО: Токен краткосрочный (меньше дня)")
            else:
                print(f"   ⚠️ Токен долгосрочный ({days} дней)")
    else:
        print(f"❌ Ошибка авторизации: {response.status_code}")
        print(f"   {response.text}")


def test_login_with_remember_me():
    """Тест авторизации С 'Запомнить меня'"""
    print("\n" + "="*60)
    print("ТЕСТ 2: Авторизация С 'Запомнить меня'")
    print("="*60)
    
    response = requests.post(f"{API}/auth/login", json={
        "email": "admin@admin.com",
        "password": "admin123",
        "remember_me": True
    })
    
    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        print(f"✅ Авторизация успешна!")
        print(f"   Пользователь: {data.get('user', {}).get('email')}")
        
        exp_date, days = decode_token_expiry(token)
        if exp_date:
            print(f"   Токен истекает: {exp_date}")
            print(f"   Дней до истечения: {days}")
            print(f"   Лет до истечения: {days // 365}")
            
            if days > 30000:  # ~82 года
                print(f"   ✅ КОРРЕКТНО: Токен бессрочный (~{days // 365} лет)")
            else:
                print(f"   ❌ ОШИБКА: Токен должен быть бессрочным!")
    else:
        print(f"❌ Ошибка авторизации: {response.status_code}")
        print(f"   {response.text}")


def test_token_validation(token):
    """Проверка что токен работает"""
    print("\n" + "="*60)
    print("ТЕСТ 3: Проверка токена через /auth/me")
    print("="*60)
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{API}/auth/me", headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Токен валиден!")
        print(f"   Пользователь: {data.get('email')}")
        print(f"   Роль: {data.get('role')}")
    else:
        print(f"❌ Токен невалиден: {response.status_code}")
        print(f"   {response.text}")


if __name__ == "__main__":
    print("\n" + "="*60)
    print("ТЕСТИРОВАНИЕ ФУНКЦИОНАЛА 'ЗАПОМНИТЬ МЕНЯ'")
    print("="*60)
    
    # Тест 1: Без remember_me
    test_login_without_remember_me()
    
    # Тест 2: С remember_me
    test_login_with_remember_me()
    
    # Тест 3: Проверка токена
    print("\n" + "="*60)
    print("ТЕСТ 3: Получение и проверка токена с remember_me=True")
    print("="*60)
    
    response = requests.post(f"{API}/auth/login", json={
        "email": "admin@admin.com",
        "password": "admin123",
        "remember_me": True
    })
    
    if response.status_code == 200:
        token = response.json().get("access_token")
        test_token_validation(token)
    
    print("\n" + "="*60)
    print("ТЕСТИРОВАНИЕ ЗАВЕРШЕНО")
    print("="*60)
