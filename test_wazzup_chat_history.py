"""
Тестовый скрипт для получения истории сообщений с клиентом через Wazzup24
"""

import asyncio
import sys
import os
from dotenv import load_dotenv

# ВАЖНО: Загружаем .env ПЕРЕД импортом сервиса
env_path = os.path.join(os.path.dirname(__file__), 'backend', '.env')
load_dotenv(env_path)

# Добавляем backend в путь
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from services.wazzup_service import wazzup_service


async def test_get_chat_history():
    """Тест получения истории чата с клиентом"""
    
    print("=" * 60)
    print("ТЕСТ: Получение истории сообщений с клиентом")
    print("=" * 60)
    
    # Номер телефона для теста (замените на реальный)
    test_phone = "87781647391"  # Можно использовать формат 8... или +7...
    
    print(f"\n1. Тестируем с номером: {test_phone}")
    print("-" * 60)
    
    try:
        # Проверяем доступность API
        print("\n📡 Проверка подключения к Wazzup24...")
        channels = await wazzup_service.get_channels()
        print(f"✅ Подключение успешно! Найдено каналов: {len(channels)}")
        
        if channels:
            for i, channel in enumerate(channels, 1):
                print(f"   {i}. {channel.name} ({channel.type}) - {channel.status}")
                print(f"      ID: {channel.id}")
                if channel.phone:
                    print(f"      Phone: {channel.phone}")
        
        # Получаем историю сообщений
        print(f"\n💬 Получение истории сообщений с {test_phone}...")
        chat_history = await wazzup_service.get_chat_messages(
            phone=test_phone,
            limit=50  # Получаем последние 50 сообщений
        )
        
        print("\n" + "=" * 60)
        print("РЕЗУЛЬТАТ")
        print("=" * 60)
        print(f"📱 Телефон: {chat_history['phone']}")
        print(f"💬 Chat ID: {chat_history['chat_id']}")
        print(f"📢 Channel ID: {chat_history['channel_id']}")
        print(f"📊 Всего сообщений: {chat_history['total_count']}")
        print(f"📄 Есть еще сообщения: {'Да' if chat_history['has_more'] else 'Нет'}")
        
        messages = chat_history['messages']
        
        if messages:
            print(f"\n📝 ИСТОРИЯ ПЕРЕПИСКИ ({len(messages)} сообщений):")
            print("-" * 60)
            
            for i, msg in enumerate(messages, 1):
                direction = "➡️ ИСХОДЯЩЕЕ" if msg.metadata.get('from_me') else "⬅️ ВХОДЯЩЕЕ"
                timestamp = msg.sent_at.strftime("%d.%m.%Y %H:%M") if msg.sent_at else "N/A"
                
                print(f"\n{i}. {direction} [{timestamp}]")
                print(f"   ID: {msg.id}")
                print(f"   Тип: {msg.message_type}")
                
                if msg.text:
                    # Обрезаем длинные сообщения
                    text_preview = msg.text[:100] + "..." if len(msg.text) > 100 else msg.text
                    print(f"   Текст: {text_preview}")
                
                if msg.media_url:
                    print(f"   Медиа: {msg.media_url}")
                
                if msg.status:
                    print(f"   Статус: {msg.status}")
        else:
            print("\n⚠️ История сообщений пуста")
            print("   Возможные причины:")
            print("   - С этим номером еще не было переписки")
            print("   - Номер указан в неправильном формате")
            print("   - Нет доступа к истории через API")
        
        print("\n" + "=" * 60)
        print("✅ ТЕСТ ЗАВЕРШЕН УСПЕШНО")
        print("=" * 60)
        
    except Exception as e:
        print("\n" + "=" * 60)
        print("❌ ОШИБКА")
        print("=" * 60)
        print(f"Тип ошибки: {type(e).__name__}")
        print(f"Сообщение: {str(e)}")
        
        import traceback
        print("\nПодробный traceback:")
        traceback.print_exc()
        
        print("\n" + "=" * 60)
        print("СОВЕТЫ ПО УСТРАНЕНИЮ:")
        print("=" * 60)
        print("1. Проверьте, что WAZZUP24_API_KEY правильно настроен в .env")
        print("2. Убедитесь, что у вас есть активный канал WhatsApp")
        print("3. Проверьте, что номер телефона существует в Wazzup24")
        print("4. Попробуйте использовать формат +7... вместо 8...")


async def test_with_pagination():
    """Тест получения истории с пагинацией (для большого количества сообщений)"""
    
    print("\n\n" + "=" * 60)
    print("ТЕСТ: Получение всей истории с пагинацией")
    print("=" * 60)
    
    test_phone = "87781647391"
    all_messages = []
    before = None
    page = 1
    
    try:
        while True:
            print(f"\n📄 Страница {page}...")
            
            chat_history = await wazzup_service.get_chat_messages(
                phone=test_phone,
                limit=50,
                before=before
            )
            
            messages = chat_history['messages']
            
            if not messages:
                print("   Больше сообщений нет")
                break
            
            all_messages.extend(messages)
            print(f"   Получено сообщений: {len(messages)}")
            
            if not chat_history['has_more']:
                break
            
            # Для следующей страницы используем ID последнего сообщения
            before = messages[-1].id
            page += 1
            
            # Защита от бесконечного цикла
            if page > 10:
                print("   Достигнут лимит страниц (10)")
                break
        
        print("\n" + "=" * 60)
        print(f"✅ Всего загружено сообщений: {len(all_messages)}")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Ошибка пагинации: {str(e)}")


async def main():
    """Главная функция"""
    
    print("\n")
    print("╔" + "=" * 58 + "╗")
    print("║" + " " * 10 + "ТЕСТИРОВАНИЕ WAZZUP24 CHAT HISTORY" + " " * 13 + "║")
    print("╚" + "=" * 58 + "╝")
    
    # Проверяем, что API ключ настроен
    if not os.getenv("WAZZUP24_API_KEY"):
        print("\n❌ ОШИБКА: WAZZUP24_API_KEY не найден в .env файле!")
        print("Добавьте его в backend/.env:")
        print("WAZZUP24_API_KEY=your_api_key_here")
        return
    
    print(f"\n✅ API ключ найден: {os.getenv('WAZZUP24_API_KEY')[:10]}...")
    
    # Запускаем тесты
    await test_get_chat_history()
    
    # Опционально: тест с пагинацией
    response = input("\n\nХотите протестировать загрузку всей истории с пагинацией? (y/n): ")
    if response.lower() == 'y':
        await test_with_pagination()
    
    print("\n\n✨ Все тесты завершены! ✨\n")


if __name__ == "__main__":
    asyncio.run(main())
