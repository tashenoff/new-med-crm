#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт для проверки данных врачей с гибридной оплатой в базе данных
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

def check_doctors_data(base_url, token):
    """Проверяет данные всех врачей"""
    doctors_url = f"{base_url}/api/doctors"
    
    try:
        req = urllib.request.Request(doctors_url)
        req.add_header('Authorization', f'Bearer {token}')
        req.add_header('Content-Type', 'application/json')
        
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.getcode() == 200:
                doctors = json.loads(response.read().decode('utf-8'))
                return doctors
    except Exception as e:
        print(f"❌ Ошибка получения врачей: {e}")
    return []

def main():
    print("🔍 ПРОВЕРКА ДАННЫХ ВРАЧЕЙ В БАЗЕ ДАННЫХ")
    print("=" * 50)

    base_url = "http://localhost:8001"
    email = "admin@medcenter.com"
    password = "admin123"
    
    # Авторизация
    token = get_auth_token(base_url, email, password)
    if not token:
        print("❌ Не удалось авторизоваться")
        return
    
    print("✅ Авторизация успешна")
    
    # Получаем всех врачей
    doctors = check_doctors_data(base_url, token)
    
    if not doctors:
        print("❌ Врачи не найдены")
        return
    
    print(f"\n📋 НАЙДЕНО ВРАЧЕЙ: {len(doctors)}")
    print("=" * 50)
    
    for i, doctor in enumerate(doctors, 1):
        print(f"\n{i}. {doctor.get('full_name', 'Без имени')}")
        print(f"   ID: {doctor.get('id')}")
        print(f"   Специальность: {doctor.get('specialty', 'Не указана')}")
        print(f"   Тип оплаты: {doctor.get('payment_type', 'Не указан')}")
        print(f"   Значение оплаты: {doctor.get('payment_value', 'Не указано')}")
        print(f"   Валюта: {doctor.get('currency', 'Не указана')}")
        
        # Проверяем гибридные поля
        if doctor.get('payment_type') == 'hybrid':
            print("   🔗 ГИБРИДНАЯ ОПЛАТА:")
            print(f"      💰 Фиксированная часть: {doctor.get('payment_value', 0)} {doctor.get('currency', 'KZT')}")
            print(f"      📊 Процентная часть: {doctor.get('hybrid_percentage_value', 0)}%")
            print(f"      🏦 Фиксированная сумма (legacy): {doctor.get('hybrid_fixed_amount', 0)}")
            
            # Проверяем корректность данных
            has_fixed = doctor.get('payment_value', 0) > 0
            has_percentage = doctor.get('hybrid_percentage_value', 0) > 0
            
            if has_fixed and has_percentage:
                print("      ✅ Данные корректны")
            else:
                print("      ❌ Данные некорректны:")
                if not has_fixed:
                    print("         - Отсутствует фиксированная часть")
                if not has_percentage:
                    print("         - Отсутствует процентная часть")
        else:
            print(f"   💼 Обычная оплата: {doctor.get('payment_type', 'unknown')}")
        
        # Дополнительные поля
        print(f"   Дата создания: {doctor.get('created_at', 'Не указана')}")
        print(f"   Активен: {doctor.get('is_active', 'Не указано')}")
        
        # Показываем как должно отображаться во фронтенде
        if doctor.get('payment_type') == 'hybrid':
            display = f"🔗 {doctor.get('payment_value', 0):,.0f}₸ + {doctor.get('hybrid_percentage_value', 0)}%"
            print(f"   👁️ Отображение: {display}")
    
    print("\n" + "=" * 50)
    print("🎯 РЕЗЮМЕ:")
    
    hybrid_doctors = [d for d in doctors if d.get('payment_type') == 'hybrid']
    print(f"   Всего врачей: {len(doctors)}")
    print(f"   Врачей с гибридной оплатой: {len(hybrid_doctors)}")
    
    if hybrid_doctors:
        correct_hybrid = [d for d in hybrid_doctors 
                         if d.get('payment_value', 0) > 0 and d.get('hybrid_percentage_value', 0) > 0]
        print(f"   Корректных гибридных: {len(correct_hybrid)}")
        
        if len(correct_hybrid) < len(hybrid_doctors):
            print("   ⚠️ Есть врачи с некорректными данными!")
        else:
            print("   ✅ Все гибридные врачи настроены корректно")
    
    print("\n💡 Если врач создан через интерфейс, но процент не отображается,")
    print("   проверьте что поле 'hybrid_percentage_value' заполнено в базе данных.")

if __name__ == '__main__':
    main()
