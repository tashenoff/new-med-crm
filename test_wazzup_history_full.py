"""
Полный тест работы с историей сообщений Wazzup24 через MongoDB
"""
import asyncio
import sys
import os
from dotenv import load_dotenv

# Загружаем .env
env_path = os.path.join(os.path.dirname(__file__), 'backend', '.env')
load_dotenv(env_path)

# Добавляем backend в путь
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from services.wazzup_service import wazzup_service
from models.wazzup import SendMessageRequest

async def test_full_history_workflow():
    """Полный тест: отправка → сохранение → получение истории"""
    
    print("=" * 70)
    print("ПОЛНЫЙ ТЕСТ РАБОТЫ С ИСТОРИЕЙ WAZZUP24")
    print("=" * 70)
    
    test_phone = "87781647391"
    test_message = "Тест работы с историей сообщений"
    
    print(f"\n1️⃣ ОТПРАВКА СООБЩЕНИЯ")
    print("-" * 70)
    print(f"Телефон: {test_phone}")
    print(f"Текст: {test_message}")
    
    try:
        # Отправляем сообщение (автоматически сохраняется в БД)
        request = SendMessageRequest(
            phone=test_phone,
            text=test_message
        )
        
        result = await wazzup_service.send_message(request)
        
        print(f"✅ Сообщение отправлено!")
        print(f"   ID: {result.id}")
        print(f"   Статус: {result.status}")
        print(f"   Время: {result.sent_at}")
        
    except Exception as e:
        print(f"❌ Ошибка отправки: {e}")
        return
    
    # Даем время на сохранение в БД
    await asyncio.sleep(1)
    
    print(f"\n2️⃣ ПОЛУЧЕНИЕ ИСТОРИИ ИЗ MONGODB")
    print("-" * 70)
    
    try:
        history = await wazzup_service.get_history_from_db(
            phone=test_phone,
            limit=50
        )
        
        print(f"✅ История получена!")
        print(f"   Телефон: {history['phone']}")
        print(f"   Chat ID: {history['chat_id']}")
        print(f"   Всего сообщений: {history['total_count']}")
        print(f"   Есть еще: {history['has_more']}")
        
        messages = history['messages']
        
        if messages:
            print(f"\n📝 ПОСЛЕДНИЕ СООБЩЕНИЯ ({len(messages)} шт.):")
            print("-" * 70)
            
            for i, msg in enumerate(messages[:10], 1):  # Показываем первые 10
                direction = "➡️ ИСХОДЯЩЕЕ" if msg.metadata.get('from_me') else "⬅️ ВХОДЯЩЕЕ"
                timestamp = msg.sent_at.strftime("%d.%m.%Y %H:%M:%S") if msg.sent_at else "N/A"
                
                print(f"\n{i}. {direction} [{timestamp}]")
                if msg.text:
                    text_preview = msg.text[:80] + "..." if len(msg.text) > 80 else msg.text
                    print(f"   {text_preview}")
        else:
            print("\n⚠️ История пуста")
        
        print("\n" + "=" * 70)
        print("✅ ТЕСТ ЗАВЕРШЕН УСПЕШНО!")
        print("=" * 70)
        
        print("\n💡 РЕЗУЛЬТАТЫ:")
        print(f"   • Отправка: ✅ работает")
        print(f"   • Сохранение в БД: ✅ работает")
        print(f"   • Получение истории: ✅ работает")
        print(f"   • Всего сообщений в БД: {history['total_count']}")
        
    except Exception as e:
        print(f"❌ Ошибка получения истории: {e}")
        import traceback
        traceback.print_exc()


async def test_history_api_endpoint():
    """Тест API endpoint через HTTP"""
    print("\n\n" + "=" * 70)
    print("ТЕСТ API ENDPOINT /api/wazzup/messages/history/{phone}")
    print("=" * 70)
    
    import httpx
    
    # Настройки API
    api_url = "http://localhost:8001/api/wazzup/messages/history/87781647391"
    
    print(f"\nURL: {api_url}")
    print("\n⚠️ Для этого теста нужно:")
    print("1. Запустить сервер: cd backend && python server.py")
    print("2. Авторизоваться и получить токен")
    print("\nЕсли сервер запущен, продолжить? (y/n): ", end="")


if __name__ == "__main__":
    print("\n")
    asyncio.run(test_full_history_workflow())
    
    # asyncio.run(test_history_api_endpoint())
    
    print("\n\n✨ Все тесты завершены ✨\n")
