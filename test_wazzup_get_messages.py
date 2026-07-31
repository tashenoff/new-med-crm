"""
Простой тест для получения сообщений через Wazzup24 API
"""
import asyncio
import httpx
import json
from dotenv import load_dotenv
import os

# Загружаем .env
load_dotenv('backend/.env')

API_KEY = os.getenv("WAZZUP24_API_KEY", "4250fedcde354324ae24bb2b68bead73")
BASE_URL = "https://api.wazzup24.com/v3"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

print("🔍 Тестирование получения сообщений Wazzup24...")
print(f"API Key: {API_KEY[:10]}...")
print(f"Base URL: {BASE_URL}")
print("=" * 60)


async def test_endpoints():
    """Тестируем различные endpoints"""
    
    test_phone = "77781647391"
    chat_id = f"{test_phone}@c.us"
    channel_id = None
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        
        # Тест 1: Получаем каналы
        print("\n1️⃣ Получение каналов...")
        try:
            response = await client.get(f"{BASE_URL}/channels", headers=headers)
            print(f"   Статус: {response.status_code}")
            if response.status_code == 200:
                channels = response.json()
                if isinstance(channels, list) and len(channels) > 0:
                    channel_id = channels[0].get('channelId') or channels[0].get('id')
                    print(f"   ✅ Канал найден: {channel_id}")
                    print(f"   Данные: {json.dumps(channels[0], indent=2, ensure_ascii=False)}")
                else:
                    print(f"   Ответ: {json.dumps(channels, indent=2, ensure_ascii=False)}")
                    return
        except Exception as e:
            print(f"   ❌ Ошибка: {e}")
            return
        
        # Тест 2: Получаем чаты
        print(f"\n2️⃣ Получение чатов (GET /chats)...")
        try:
            response = await client.get(f"{BASE_URL}/chats", headers=headers)
            print(f"   Статус: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Успех!")
                print(f"   Ответ: {json.dumps(data, indent=2, ensure_ascii=False)[:500]}")
            else:
                print(f"   Ответ: {response.text[:200]}")
        except Exception as e:
            print(f"   ❌ Ошибка: {e}")
        
        # Тест 3: Получаем диалоги
        print(f"\n3️⃣ Получение диалогов (GET /dialogs)...")
        try:
            response = await client.get(f"{BASE_URL}/dialogs", headers=headers)
            print(f"   Статус: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Успех!")
                print(f"   Ответ: {json.dumps(data, indent=2, ensure_ascii=False)[:500]}")
            else:
                print(f"   Ответ: {response.text[:200]}")
        except Exception as e:
            print(f"   ❌ Ошибка: {e}")
        
        # Тест 4: Получаем сообщения через канал
        print(f"\n4️⃣ Получение сообщений через канал (GET /channels/{{id}}/messages)...")
        try:
            endpoint = f"{BASE_URL}/channels/{channel_id}/messages"
            print(f"   Endpoint: {endpoint}")
            response = await client.get(endpoint, headers=headers)
            print(f"   Статус: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Успех!")
                print(f"   Ответ: {json.dumps(data, indent=2, ensure_ascii=False)[:500]}")
            else:
                print(f"   Ответ: {response.text[:200]}")
        except Exception as e:
            print(f"   ❌ Ошибка: {e}")
        
        # Тест 5: Получаем сообщения конкретного чата
        print(f"\n5️⃣ Получение сообщений чата (GET /chats/{{chatId}}/messages)...")
        try:
            endpoint = f"{BASE_URL}/chats/{chat_id}/messages"
            print(f"   Endpoint: {endpoint}")
            response = await client.get(endpoint, headers=headers, params={"limit": 50})
            print(f"   Статус: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Успех!")
                print(f"   Ответ: {json.dumps(data, indent=2, ensure_ascii=False)[:1000]}")
                return data
            else:
                print(f"   Ответ: {response.text[:200]}")
        except Exception as e:
            print(f"   ❌ Ошибка: {e}")
        
        # Тест 6: История чата через channelId
        print(f"\n6️⃣ История чата (GET /history)...")
        try:
            params = {
                "channelId": channel_id,
                "chatId": chat_id,
                "limit": 50
            }
            endpoint = f"{BASE_URL}/history"
            print(f"   Endpoint: {endpoint}")
            print(f"   Params: {params}")
            response = await client.get(endpoint, headers=headers, params=params)
            print(f"   Статус: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Успех!")
                print(f"   Ответ: {json.dumps(data, indent=2, ensure_ascii=False)[:1000]}")
                return data
            else:
                print(f"   Ответ: {response.text[:200]}")
        except Exception as e:
            print(f"   ❌ Ошибка: {e}")
        
        # Тест 7: Альтернативный endpoint для сообщений
        print(f"\n7️⃣ Альтернативный endpoint (POST /messages/list)...")
        try:
            payload = {
                "channelId": channel_id,
                "chatId": chat_id,
                "limit": 50
            }
            endpoint = f"{BASE_URL}/messages/list"
            print(f"   Endpoint: {endpoint}")
            response = await client.post(endpoint, headers=headers, json=payload)
            print(f"   Статус: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Успех!")
                print(f"   Ответ: {json.dumps(data, indent=2, ensure_ascii=False)[:1000]}")
                return data
            else:
                print(f"   Ответ: {response.text[:200]}")
        except Exception as e:
            print(f"   ❌ Ошибка: {e}")
    
    return None


if __name__ == "__main__":
    print("\n")
    asyncio.run(test_endpoints())
    print("\n" + "=" * 60)
    print("✨ Тестирование завершено!")
    print("=" * 60)
    print("\n📚 Документация Wazzup24 API:")
    print("   https://wazzup24.com/knowledge-base/")
    print("\n")
