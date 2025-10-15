#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script to create a test doctor with hybrid payment via API with login
"""

import urllib.request
import urllib.parse
import json

def get_auth_token(base_url, email, password):
    """Получает токен авторизации"""
    auth_url = f"{base_url}/api/auth/login"
    
    # Данные для авторизации
    auth_data = {
        "email": email,
        "password": password
    }
    
    try:
        # Подготавливаем данные для отправки (JSON)
        data = json.dumps(auth_data).encode('utf-8')
        
        # Создаем запрос
        req = urllib.request.Request(auth_url, data=data)
        req.add_header('Content-Type', 'application/json')
        
        print(f"🔑 Авторизация на {auth_url}")
        print(f"   Email: {email}")
        
        # Отправляем запрос
        with urllib.request.urlopen(req, timeout=10) as response:
            status_code = response.getcode()
            response_data = response.read().decode('utf-8')
            
            if status_code == 200:
                result = json.loads(response_data)
                token = result.get('access_token')
                if token:
                    print("✅ Авторизация успешна!")
                    return token
                else:
                    print("❌ Токен не найден в ответе")
                    print(f"Ответ: {response_data}")
                    return None
            else:
                print(f"❌ Ошибка авторизации: {status_code}")
                print(f"Ответ: {response_data}")
                return None
                
    except urllib.error.HTTPError as e:
        print(f"❌ HTTP ошибка при авторизации: {e.code}")
        try:
            error_data = e.read().decode('utf-8')
            print(f"   Ответ: {error_data}")
        except:
            pass
        return None
        
    except Exception as e:
        print(f"❌ Ошибка авторизации: {e}")
        return None

def create_doctor_with_token(base_url, token):
    """Создает врача с полученным токеном"""
    doctors_url = f"{base_url}/api/doctors"
    
    # Данные врача с гибридной оплатой
    doctor_data = {
        "full_name": "Тестовый Врач Гибрид",
        "specialty": "Стоматолог-ортопед", 
        "phone": "+7-777-999-1234",
        "calendar_color": "#9C27B0",
        "payment_type": "hybrid",
        "payment_value": 60000.0,  # Фиксированная часть
        "hybrid_percentage_value": 15.0,  # Процентная часть
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
        req.add_header('Authorization', f'Bearer {token}')

        print(f"\n🚀 Создание врача на {doctors_url}")
        print(f"   📊 Данные: {json.dumps(doctor_data, ensure_ascii=False, indent=2)}")
        
        # Отправляем запрос
        with urllib.request.urlopen(req, timeout=10) as response:
            status_code = response.getcode()
            response_data = response.read().decode('utf-8')
            
            print(f"\n📡 Ответ сервера:")
            print(f"   Статус: {status_code}")
            
            if status_code in [200, 201]:
                result = json.loads(response_data)
                print("🎉 ВРАЧ СОЗДАН УСПЕШНО!")
                print(f"   🆔 ID: {result.get('id')}")
                print(f"   👨‍⚕️ Имя: {result.get('full_name')}")
                print(f"   💼 Специальность: {result.get('specialty')}")
                print(f"   💰 Фиксированная часть: {result.get('payment_value')} ₸")
                print(f"   📊 Процентная часть: {result.get('hybrid_percentage_value')}%")
                print(f"   🔗 Отображение: {result.get('payment_value')}₸ + {result.get('hybrid_percentage_value')}%")
                
                # Проверяем, что гибридные поля сохранились корректно
                if (result.get('payment_type') == 'hybrid' and 
                    result.get('payment_value') == 60000.0 and 
                    result.get('hybrid_percentage_value') == 15.0):
                    print(f"\n✅ ВСЕ ГИБРИДНЫЕ ПОЛЯ СОХРАНЕНЫ КОРРЕКТНО!")
                else:
                    print(f"\n⚠️ Проблема с сохранением гибридных полей:")
                    print(f"   payment_type: {result.get('payment_type')}")
                    print(f"   payment_value: {result.get('payment_value')}")
                    print(f"   hybrid_percentage_value: {result.get('hybrid_percentage_value')}")
                
                print(f"\n✅ Теперь откройте фронтенд и проверьте:")
                print(f"   1. Раздел 'Врачи'")
                print(f"   2. Найдите '{result.get('full_name')}'") 
                print(f"   3. Должно отображаться: 🔗 60,000₸ + 15.0%")
                
                return True
            else:
                print(f"⚠️ Неожиданный статус: {status_code}")
                print(f"   Ответ: {response_data}")
                return False
                
    except urllib.error.HTTPError as e:
        print(f"❌ HTTP ошибка: {e.code}")
        try:
            error_detail = json.loads(e.read().decode('utf-8'))
            print(f"   Детали: {json.dumps(error_detail, ensure_ascii=False, indent=2)}")
        except:
            print(f"   Ответ: {e.read().decode('utf-8')}")
        return False
            
    except Exception as e:
        print(f"❌ Ошибка создания врача: {e}")
        return False

def main():
    print("🏥 СОЗДАНИЕ ВРАЧА С ГИБРИДНОЙ ОПЛАТОЙ")
    print("=" * 50)

    # Настройки
    base_url = "http://localhost:8001"
    email = "admin@medcenter.com"
    password = "admin123"
    
    print(f"🌐 Backend URL: {base_url}")
    print(f"👤 Логин: {email}")
    
    # Шаг 1: Авторизация
    token = get_auth_token(base_url, email, password)
    if not token:
        print("❌ Не удалось получить токен авторизации")
        return False
    
    # Шаг 2: Создание врача
    success = create_doctor_with_token(base_url, token)
    
    if success:
        print("\n🎯 ЗАДАЧА ВЫПОЛНЕНА УСПЕШНО!")
        print("   Врач с гибридной оплатой создан")
    else:
        print("\n❌ Не удалось создать врача")
    
    return success

if __name__ == '__main__':
    main()
