"""
Тест отправки с номером начинающимся с 8
"""
import asyncio
import sys
import os
from dotenv import load_dotenv

# Загружаем .env из backend
env_path = os.path.join(os.path.dirname(__file__), 'backend', '.env')
load_dotenv(env_path)

# Добавляем backend в путь
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from services.wazzup_service import wazzup_service
from models.wazzup import SendMessageRequest

async def test_send_message():
    print("📱 Тест отправки с номером через 8")
    print("-" * 60)
    
    # Номер в формате 8
    test_phone = "87781647391"
    test_message = "Тестовое сообщение для alex от Medical CRM"
    
    print(f"Исходный номер: {test_phone}")
    
    # Проверяем форматирование
    formatted = await wazzup_service.format_phone(test_phone)
    print(f"Отформатированный: {formatted}")
    print(f"Сообщение: {test_message}")
    print("-" * 60)
    
    try:
        # Создаем запрос
        request = SendMessageRequest(
            phone=test_phone,
            text=test_message
        )
        
        # Отправляем
        print("⏳ Отправка...")
        result = await wazzup_service.send_message(request)
        
        print("✅ УСПЕХ!")
        print(f"ID сообщения: {result.id}")
        print(f"Телефон: {result.contact_phone}")
        print(f"Текст: {result.text}")
        print(f"Статус: {result.status}")
        print(f"Время отправки: {result.sent_at}")
        
    except Exception as e:
        print(f"❌ ОШИБКА: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_send_message())
