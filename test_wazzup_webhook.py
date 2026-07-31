"""
Тест Webhook для интеграции WhatsApp -> CRM Leads
"""

import requests
import json

BASE_URL = "http://localhost:8001"

def test_webhook_new_lead():
    """Тест 1: Создание нового лида из WhatsApp"""
    print("\n=== Тест 1: Новое сообщение WhatsApp -> Создание лида ===")
    
    payload = {
        "type": "incomingMessage",
        "message": {
            "chatId": "996555123456@c.us",
            "text": "Здравствуйте, хочу записаться на прием к стоматологу",
            "userName": "Иван Петров",
            "channelId": "channel123",
            "messageId": "msg001",
            "timestamp": "2026-03-18T14:00:00Z"
        }
    }
    
    response = requests.post(
        f"{BASE_URL}/api/wazzup/webhook/messages",
        json=payload
    )
    
    print(f"Статус: {response.status_code}")
    print(f"Ответ: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
    
    if response.status_code == 200:
        result = response.json()
        if result.get("status") == "ok" and "lead_id" in result:
            print("✅ Лид успешно создан!")
            return result.get("lead_id")
        else:
            print("⚠️  Неожиданный ответ")
            return None
    else:
        print("❌ Ошибка при создании лида")
        return None


def test_webhook_duplicate_prevention(lead_id=None):
    """Тест 2: Проверка предотвращения дубликатов"""
    print("\n=== Тест 2: Повторное сообщение -> НЕ создает дубликат ===")
    
    payload = {
        "type": "incomingMessage",
        "message": {
            "chatId": "996555123456@c.us",
            "text": "У меня болит зуб, когда можно прийти?",
            "userName": "Иван Петров",
            "channelId": "channel123",
            "messageId": "msg002",
            "timestamp": "2026-03-18T14:05:00Z"
        }
    }
    
    response = requests.post(
        f"{BASE_URL}/api/wazzup/webhook/messages",
        json=payload
    )
    
    print(f"Статус: {response.status_code}")
    print(f"Ответ: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
    
    if response.status_code == 200:
        result = response.json()
        if result.get("message") == "Active lead already exists":
            print("✅ Дубликат НЕ создан (правильно!)")
            print(f"   Используется существующий лид: {result.get('lead_id')}")
            return True
        elif result.get("message") == "New lead created":
            print("❌ Ошибка: создан дубликат лида!")
            return False
    else:
        print("❌ Ошибка при обработке webhook")
        return False


def test_webhook_new_client_repeat():
    """Тест 3: Повторное обращение (через год) -> Новый лид"""
    print("\n=== Тест 3: Новое обращение другого клиента ===")
    
    payload = {
        "type": "incomingMessage",
        "message": {
            "chatId": "996777888999@c.us",
            "text": "Добрый день, хочу записаться на консультацию",
            "userName": "Мария Сидорова",
            "channelId": "channel123",
            "messageId": "msg003",
            "timestamp": "2026-03-18T15:00:00Z"
        }
    }
    
    response = requests.post(
        f"{BASE_URL}/api/wazzup/webhook/messages",
        json=payload
    )
    
    print(f"Статус: {response.status_code}")
    print(f"Ответ: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
    
    if response.status_code == 200:
        result = response.json()
        if result.get("message") == "New lead created":
            print("✅ Новый лид создан для нового клиента!")
            return result.get("lead_id")
        else:
            print("⚠️  Неожиданный ответ")
            return None
    else:
        print("❌ Ошибка при создании лида")
        return None


def check_leads_in_crm(token="your_auth_token_here"):
    """Проверка созданных лидов в CRM"""
    print("\n=== Проверка лидов в CRM ===")
    print("⚠️  Для проверки требуется токен авторизации")
    print("   Можно проверить в браузере: http://localhost:5173/crm-leads")


def main():
    print("=" * 60)
    print("ТЕСТИРОВАНИЕ ИНТЕГРАЦИИ WAZZUP24 -> CRM LEADS")
    print("=" * 60)
    print("\n📋 Логика работы:")
    print("1. Новое сообщение WhatsApp -> Создание лида в 'НЕРАЗОБРАННЫЕ'")
    print("2. Повторное сообщение от того же номера -> НЕ создает дубликат")
    print("3. Если старый лид закрыт, новое обращение -> Новый лид\n")
    
    try:
        # Тест 1: Создание нового лида
        lead_id = test_webhook_new_lead()
        
        if lead_id:
            # Тест 2: Проверка дубликатов
            test_webhook_duplicate_prevention(lead_id)
        
        # Тест 3: Новый клиент
        test_webhook_new_client_repeat()
        
        # Проверка в CRM
        check_leads_in_crm()
        
        print("\n" + "=" * 60)
        print("✅ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО")
        print("=" * 60)
        print("\n📌 Следующие шаги:")
        print("1. Откройте http://localhost:5173/crm-leads")
        print("2. Проверьте, что лиды появились в колонке 'НЕРАЗОБРАННЫЕ'")
        print("3. Настройте webhook в кабинете Wazzup24:")
        print("   URL: http://ваш-домен/api/wazzup/webhook/messages")
        print("   Метод: POST")
        print("   События: Входящие сообщения\n")
        
    except requests.exceptions.ConnectionError:
        print("\n❌ ОШИБКА: Не удалось подключиться к серверу")
        print("   Убедитесь, что backend запущен на http://localhost:8001")
        print("   Запустите: cd backend && python server.py")
    except Exception as e:
        print(f"\n❌ ОШИБКА: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
