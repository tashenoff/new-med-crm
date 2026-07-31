"""
Простой тест отправки сообщения через Wazzup24
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
    print("📱 Тест отправки сообщения через Wazzup24")
    print("-" * 60)
    
    # Тестовый номер (замените на реальный)
    test_phone = "77781647391"  # или +7 778 164 73 91
    test_message = "Привет! Это тестовое сообщение от Medical CRM"
    
    print(f"Телефон: {test_phone}")
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
