#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script to create a test doctor with hybrid payment via API
"""

import urllib.request
import urllib.parse
import json

def main():
    print("🏥 СОЗДАНИЕ ВРАЧА С ГИБРИДНОЙ ОПЛАТОЙ ЧЕРЕЗ API")
    print("=" * 60)

    # API endpoints
    base_url = "http://localhost:8001"  # Стандартный порт FastAPI
    doctors_url = f"{base_url}/api/doctors"

    # Данные для авторизации (нужен токен)
    print("ℹ️  Для создания врача через API нужен токен авторизации")
    print("   Получите токен из браузера (Developer Tools -> Network -> Headers)")
    print("   Если нет токена, нажмите Enter для пропуска")
    
    token = input("🔑 Введите токен авторизации: ").strip()

    # Данные врача с гибридной оплатой
    doctor_data = {
        "full_name": "Тестовый Врач API",
        "specialty": "Стоматолог-хирург", 
        "phone": "+7-777-888-9999",
        "calendar_color": "#E91E63",
        "payment_type": "hybrid",
        "payment_value": 75000.0,  # Фиксированная часть
        "hybrid_percentage_value": 8.5,  # Процентная часть
        "currency": "KZT",
        "services": [],
        "payment_mode": "general"
    }

    try:
        # Подготавливаем данные для отправки
        data = json.dumps(doctor_data).encode('utf-8')
        
        # Создаем запрос
        req = urllib.request.Request(doctors_url, data=data)
        req.add_header('Content-Type', 'application/json')
        
        if token:
            req.add_header('Authorization', f'Bearer {token}')
            print("✅ Токен добавлен в заголовки")
        else:
            print("⚠️ Запрос без авторизации")

        print(f"\n🚀 Отправка запроса на {doctors_url}")
        print(f"   📊 Данные: {json.dumps(doctor_data, ensure_ascii=False, indent=2)}")
        
        # Отправляем запрос
        with urllib.request.urlopen(req, timeout=10) as response:
            status_code = response.getcode()
            response_data = response.read().decode('utf-8')
            
            print(f"\n📡 Ответ сервера:")
            print(f"   Статус: {status_code}")
            
            if status_code == 201:
                result = json.loads(response_data)
                print("✅ Врач создан успешно!")
                print(f"   ID: {result.get('id')}")
                print(f"   Имя: {result.get('full_name')}")
                print(f"   Тип оплаты: {result.get('payment_type')}")
                print(f"   💰 Фиксированная часть: {result.get('payment_value')} ₸")
                print(f"   📊 Процентная часть: {result.get('hybrid_percentage_value')}%")
            else:
                print(f"⚠️ Неожиданный статус: {status_code}")
                print(f"   Ответ: {response_data}")
                
    except urllib.error.HTTPError as e:
        print(f"❌ HTTP ошибка: {e.code}")
        if e.code == 401:
            print("   Ошибка авторизации - проверьте токен")
        elif e.code == 422:
            print("   Ошибка валидации данных")
            try:
                error_detail = json.loads(e.read().decode('utf-8'))
                print(f"   Детали: {json.dumps(error_detail, ensure_ascii=False, indent=2)}")
            except:
                print(f"   Ответ: {e.read().decode('utf-8')}")
        else:
            print(f"   Ответ: {e.read().decode('utf-8')}")
            
    except urllib.error.URLError as e:
        print(f"❌ Не удалось подключиться к серверу: {e.reason}")
        print("   Проверьте, что backend запущен на http://localhost:8001")
        print("   Для запуска: cd backend && python -m uvicorn server:app --host 0.0.0.0 --port 8001")
        
    except Exception as e:
        print(f"❌ Неожиданная ошибка: {e}")

if __name__ == '__main__':
    main()
