"""
Поиск правильных эндпоинтов Wazzup24 API v3 согласно документации
https://wazzup24.ru/help/api-ru/
"""
import asyncio
import httpx
import json
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')

API_KEY = os.getenv("WAZZUP24_API_KEY")
BASE_URL = "https://api.wazzup24.com/v3"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

async def test_all_possible_endpoints():
    """Тестируем все возможные эндпоинты из документации"""
    
    test_phone = "77781647391"
    chat_id = f"{test_phone}@c.us"
    channel_id = None
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        
        # Получаем channel_id
        print("1️⃣ Получение channelId...")
        response = await client.get(f"{BASE_URL}/channels", headers=headers)
        if response.status_code == 200:
            channels = response.json()
            if isinstance(channels, list) and len(channels) > 0:
                channel_id = channels[0].get('channelId')
                print(f"   ✅ Channel ID: {channel_id}\n")
        
        if not channel_id:
            print("   ❌ Не удалось получить channel_id\n")
            return
        
        # Список всех возможных эндпоинтов для получения сообщений
        endpoints_to_test = [
            # Вариант 1: messages с фильтром по chatId
            {
                "name": "GET /messages с chatId и channelId",
                "method": "GET",
                "url": f"{BASE_URL}/messages",
                "params": {"chatId": chat_id, "channelId": channel_id, "limit": 10}
            },
            # Вариант 2: Прямой путь к чату
            {
                "name": "GET /channels/{id}/chats/{chatId}",
                "method": "GET",
                "url": f"{BASE_URL}/channels/{channel_id}/chats/{chat_id}",
                "params": {}
            },
            # Вариант 3: Через ID канала и чата
            {
                "name": "POST /messages/query",
                "method": "POST",
                "url": f"{BASE_URL}/messages/query",
                "json": {"chatId": chat_id, "channelId": channel_id, "limit": 10}
            },
            # Вариант 4: Получение через поиск
            {
                "name": "POST /messages/search",
                "method": "POST",
                "url": f"{BASE_URL}/messages/search",
                "json": {"chatId": chat_id, "limit": 10}
            },
            # Вариант 5: История через sync
            {
                "name": "GET /sync",
                "method": "GET",
                "url": f"{BASE_URL}/sync",
                "params": {"channelId": channel_id, "limit": 10}
            },
            # Вариант 6: Получение обновлений
            {
                "name": "GET /updates",
                "method": "GET",
                "url": f"{BASE_URL}/updates",
                "params": {"channelId": channel_id}
            },
            # Вариант 7: Через webhooks endpoint
            {
                "name": "GET /webhooks/messages",
                "method": "GET",
                "url": f"{BASE_URL}/webhooks/messages",
                "params": {"channelId": channel_id, "limit": 10}
            },
            # Вариант 8: Прямой GET чата
            {
                "name": "GET /chats/{chatId}",
                "method": "GET",
                "url": f"{BASE_URL}/chats/{chat_id}",
                "params": {"channelId": channel_id}
            }
        ]
        
        print("🔍 Тестирование эндпоинтов...")
        print("=" * 70)
        
        for i, endpoint in enumerate(endpoints_to_test, 1):
            print(f"\n{i}. {endpoint['name']}")
            print(f"   URL: {endpoint['url']}")
            
            try:
                if endpoint['method'] == "GET":
                    response = await client.get(
                        endpoint['url'], 
                        headers=headers, 
                        params=endpoint.get('params', {})
                    )
                else:
                    response = await client.post(
                        endpoint['url'],
                        headers=headers,
                        json=endpoint.get('json', {})
                    )
                
                print(f"   Статус: {response.status_code}")
                
                if response.status_code == 200:
                    data = response.json()
                    print(f"   ✅ РАБОТАЕТ!")
                    print(f"   Ответ (первые 500 символов):")
                    print(f"   {json.dumps(data, indent=2, ensure_ascii=False)[:500]}")
                    print("\n" + "=" * 70)
                    print("🎉 НАЙДЕН РАБОЧИЙ ЭНДПОИНТ!")
                    print("=" * 70)
                    return endpoint, data
                elif response.status_code == 404:
                    print(f"   ❌ 404 - эндпоинт не существует")
                else:
                    print(f"   ⚠️ Код: {response.status_code}")
                    print(f"   Ответ: {response.text[:200]}")
                    
            except Exception as e:
                print(f"   ❌ Ошибка: {str(e)[:100]}")
        
        print("\n" + "=" * 70)
        print("😞 Ни один эндпоинт не сработал")
        print("=" * 70)
        print("\n💡 ВОЗМОЖНЫЕ РЕШЕНИЯ:")
        print("1. История сообщений доступна только через Webhook")
        print("2. Нужно использовать другую версию API")
        print("3. История доступна только в личном кабинете Wazzup24")
        print("4. Требуются дополнительные права доступа для API ключа")
        print("\n📚 Проверьте документацию: https://wazzup24.ru/help/api-ru/")

if __name__ == "__main__":
    asyncio.run(test_all_possible_endpoints())
