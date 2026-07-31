#!/usr/bin/env python3
"""
Тест нового API endpoint для статистики пациентов
"""
import requests

def test_patient_stats():
    """Тестируем endpoint статистики пациентов"""
    try:
        # Для тестирования используем простой GET без авторизации
        # В реальном приложении нужна авторизация
        response = requests.get('http://localhost:8000/patients/stats')

        print(f'Статус ответа: {response.status_code}')

        if response.status_code == 200:
            data = response.json()
            print('✅ Статистика получена успешно!')
            print(f'Всего пациентов: {data["total_patients"]}')
            print(f'Активных пациентов: {data["active_patients"]}')
            print(f'Общая выручка: {data["total_revenue"]}')
            print(f'Общий долг: {data["total_debt"]}')
            print(f'По источникам: {data["patients_by_source"]}')
        elif response.status_code == 401:
            print('❌ Требуется авторизация (ожидаемо для защищенного endpoint)')
        else:
            print(f'❌ Ошибка API: {response.text}')

    except requests.exceptions.ConnectionError:
        print('❌ Сервер не запущен или недоступен')
        print('Запустите backend сервер командой: python -m uvicorn backend.server:app --reload')
    except Exception as e:
        print(f'❌ Ошибка: {e}')

if __name__ == "__main__":
    test_patient_stats()
