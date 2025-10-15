#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт для тестирования создания врача с гибридной оплатой через API интерфейса
"""

import urllib.request
import urllib.parse
import json

def get_auth_token(base_url, email, password):
    """Получает токен авторизации"""
    auth_url = f"{base_url}/api/auth/login"
    auth_data = {"email": email, "password": password}
    
    try:
        data = json.dumps(auth_data).encode('utf-8')
        req = urllib.request.Request(auth_url, data=data)
        req.add_header('Content-Type', 'application/json')
        
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.getcode() == 200:
                result = json.loads(response.read().decode('utf-8'))
                return result.get('access_token')
    except Exception as e:
        print(f"❌ Ошибка авторизации: {e}")
    return None

def create_hybrid_doctor_via_interface(base_url, token):
    """Создает врача с гибридной оплатой через API (имитация интерфейса)"""
    doctors_url = f"{base_url}/api/doctors"
    
    # Данные врача с гибридной оплатой (как отправляет интерфейс)
    from datetime import datetime
    unique_suffix = datetime.now().strftime("%H%M%S")
    
    doctor_data = {
        "full_name": f"Интерфейс Тест Гибрид {unique_suffix}",
        "specialty": "Терапевт", 
        "phone": f"+7-777-123-{unique_suffix}",
        "calendar_color": "#FF5722",
        "payment_type": "hybrid",
        "payment_value": 45000.0,  # Фиксированная часть
        "hybrid_percentage_value": 20.0,  # Процентная часть
        "currency": "KZT",
        "services": [],
        "payment_mode": "general"
    }
    
    try:
        data = json.dumps(doctor_data).encode('utf-8')
        req = urllib.request.Request(doctors_url, data=data)
        req.add_header('Content-Type', 'application/json')
        req.add_header('Authorization', f'Bearer {token}')
        
        print(f"🚀 Создание врача через API интерфейса:")
        print(f"   📊 Данные: {json.dumps(doctor_data, ensure_ascii=False, indent=2)}")
        
        with urllib.request.urlopen(req, timeout=10) as response:
            status_code = response.getcode()
            response_data = response.read().decode('utf-8')
            
            if status_code in [200, 201]:
                result = json.loads(response_data)
                print(f"\n✅ Врач создан успешно!")
                print(f"   🆔 ID: {result.get('id')}")
                print(f"   👨‍⚕️ Имя: {result.get('full_name')}")
                print(f"   💰 Фиксированная часть: {result.get('payment_value')} ₸")
                print(f"   📊 Процентная часть: {result.get('hybrid_percentage_value')}%")
                
                # Проверяем корректность сохранения
                if (result.get('payment_type') == 'hybrid' and 
                    result.get('payment_value') == 45000.0 and 
                    result.get('hybrid_percentage_value') == 20.0):
                    print(f"   ✅ Все гибридные поля сохранены корректно!")
                    return result.get('id')
                else:
                    print(f"   ❌ Ошибка в сохранении гибридных полей:")
                    print(f"      payment_type: {result.get('payment_type')}")
                    print(f"      payment_value: {result.get('payment_value')}")
                    print(f"      hybrid_percentage_value: {result.get('hybrid_percentage_value')}")
                    return None
            else:
                print(f"❌ Ошибка создания: {status_code}")
                print(f"   Ответ: {response_data}")
                return None
                
    except urllib.error.HTTPError as e:
        print(f"❌ HTTP ошибка: {e.code}")
        try:
            error_detail = json.loads(e.read().decode('utf-8'))
            print(f"   Детали: {json.dumps(error_detail, ensure_ascii=False, indent=2)}")
        except:
            pass
        return None
        
    except Exception as e:
        print(f"❌ Неожиданная ошибка: {e}")
        return None

def check_doctor_data(base_url, token, doctor_id):
    """Проверяет данные созданного врача"""
    doctor_url = f"{base_url}/api/doctors/{doctor_id}"
    
    try:
        req = urllib.request.Request(doctor_url)
        req.add_header('Authorization', f'Bearer {token}')
        req.add_header('Content-Type', 'application/json')
        
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.getcode() == 200:
                doctor = json.loads(response.read().decode('utf-8'))
                
                print(f"\n🔍 ПРОВЕРКА ДАННЫХ ВРАЧА В БД:")
                print(f"   ID: {doctor.get('id')}")
                print(f"   Имя: {doctor.get('full_name')}")
                print(f"   Тип оплаты: {doctor.get('payment_type')}")
                print(f"   Фиксированная часть: {doctor.get('payment_value')}")
                print(f"   Процентная часть: {doctor.get('hybrid_percentage_value')}")
                
                # Финальная проверка
                if (doctor.get('payment_type') == 'hybrid' and 
                    doctor.get('payment_value') == 45000.0 and 
                    doctor.get('hybrid_percentage_value') == 20.0):
                    print(f"   🎉 ВСЕ ДАННЫЕ КОРРЕКТНЫ В БАЗЕ ДАННЫХ!")
                    
                    # Показываем как будет отображаться во фронтенде
                    display = f"🔗 {doctor.get('payment_value'):,.0f}₸ + {doctor.get('hybrid_percentage_value')}%"
                    print(f"   👁️ Отображение во фронтенде: {display}")
                    return True
                else:
                    print(f"   ❌ Данные в БД некорректны")
                    return False
                    
    except Exception as e:
        print(f"❌ Ошибка проверки врача: {e}")
        return False

def main():
    print("🧪 ТЕСТ СОЗДАНИЯ ВРАЧА С ГИБРИДНОЙ ОПЛАТОЙ ЧЕРЕЗ ИНТЕРФЕЙС")
    print("=" * 60)

    base_url = "http://localhost:8001"
    email = "admin@medcenter.com"
    password = "admin123"
    
    # Шаг 1: Авторизация
    print("1️⃣ АВТОРИЗАЦИЯ")
    token = get_auth_token(base_url, email, password)
    if not token:
        print("❌ Тест провален - не удалось авторизоваться")
        return
    print("✅ Авторизация успешна")
    
    # Шаг 2: Создание врача
    print("\n2️⃣ СОЗДАНИЕ ВРАЧА")
    doctor_id = create_hybrid_doctor_via_interface(base_url, token)
    if not doctor_id:
        print("❌ Тест провален - не удалось создать врача")
        return
    
    # Шаг 3: Проверка данных
    print("\n3️⃣ ПРОВЕРКА ДАННЫХ")
    success = check_doctor_data(base_url, token, doctor_id)
    
    # Результат теста
    print("\n" + "=" * 60)
    if success:
        print("🎯 ТЕСТ ПРОЙДЕН УСПЕШНО!")
        print("   ✅ Врач создан через интерфейс")
        print("   ✅ Гибридные поля сохранены корректно")
        print("   ✅ Данные отображаются правильно")
        print("\n💡 Теперь гибридная оплата должна работать в интерфейсе!")
    else:
        print("❌ ТЕСТ ПРОВАЛЕН!")
        print("   Проблема с сохранением гибридных полей")

if __name__ == '__main__':
    main()
