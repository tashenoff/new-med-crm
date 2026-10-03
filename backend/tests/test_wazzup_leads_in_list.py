"""WhatsApp-инбокс: в ленте виджета кроме чатов показываются лиды CRM без чата.

Решение alex (03.10.2026): источник списка /wazzup/chats расширяется — лиды из
CRM «Сделки» без WhatsApp-чата включаются одной лентой (source="lead"), дедуп по
телефону (лид с уже существующим чатом пропускается).
"""
import os

os.environ.setdefault("WAZZUP24_API_KEY", "test-key-for-tests")

import pytest  # noqa: E402


@pytest.fixture
def list_client(clean_db, monkeypatch):
    import asyncio
    from httpx import AsyncClient, ASGITransport
    import server
    import routers.wazzup as wazzup_router

    class _FakeUser:
        id = "u1"
        role = "admin"
        is_active = True
        email = "admin@test.ru"

    monkeypatch.setattr("database.db", clean_db)
    server.app.dependency_overrides[wazzup_router.get_current_user] = lambda: _FakeUser()
    transport = ASGITransport(app=server.app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _seed_chat(db, phone, name):
    from services.wazzup_chat_service import WazzupChatService
    await WazzupChatService(db).upsert_incoming(
        phone=phone, contact_name=name, text="привет", channel_id="ch1",
        ts=__import__("datetime").datetime.utcnow(),
    )


async def _seed_lead(db, phone, first, last, status="new", converted=False):
    import uuid
    from datetime import datetime
    lead = {
        "id": str(uuid.uuid4()),
        "first_name": first,
        "last_name": last,
        "phone": phone,
        "status": status,
        "source": "phone",
        "created_at": datetime.utcnow(),
    }
    if converted:
        lead["converted_to_client_id"] = "pat_" + str(uuid.uuid4())[:8]
    await db.crm_leads.insert_one(lead)
    return lead["id"]


async def test_lead_without_chat_included_in_list(list_client, clean_db):
    """Лид без чата появляется в ленте с source='lead'."""
    await _seed_lead(clean_db, "+77051234567", "Иван", "Петров")
    async with list_client as c:
        r = await c.get("/api/wazzup/chats")
    assert r.status_code == 200
    items = r.json()["chats"]
    lead_items = [i for i in items if i.get("source") == "lead"]
    assert len(lead_items) == 1
    assert lead_items[0]["phone"] == "+77051234567"
    assert "Иван" in lead_items[0]["contact_name"]
    assert lead_items[0]["linked_lead_id"]


async def test_lead_with_existing_chat_deduplicated(list_client, clean_db):
    """Лид, у которого уже есть чат, не дублируется (дедуп по телефону)."""
    await _seed_chat(clean_db, "+77051234567", "Иван Петров")
    await _seed_lead(clean_db, "+77051234567", "Иван", "Петров")
    async with list_client as c:
        r = await c.get("/api/wazzup/chats")
    assert r.status_code == 200
    items = r.json()["chats"]
    phones = [i.get("phone") for i in items]
    assert phones.count("+77051234567") == 1
    # запись одна: чат, у которого есть активный лид, помечается source='lead'
    assert items[0]["source"] == "lead"


async def test_chat_still_returned_with_source_chat(list_client, clean_db):
    """Обычный чат помечается source='chat'."""
    await _seed_chat(clean_db, "+77059998877", "Анна")
    async with list_client as c:
        r = await c.get("/api/wazzup/chats")
    assert r.status_code == 200
    items = r.json()["chats"]
    assert len(items) == 1
    assert items[0]["source"] == "chat"


async def test_include_leads_false_returns_only_chats(list_client, clean_db):
    """С include_leads=false лиды не включаются."""
    await _seed_lead(clean_db, "+77051234567", "Иван", "Петров")
    await _seed_chat(clean_db, "+77059998877", "Анна")
    async with list_client as c:
        r = await c.get("/api/wazzup/chats", params={"include_leads": False})
    assert r.status_code == 200
    items = r.json()["chats"]
    assert all(i.get("source") == "chat" for i in items)
    assert len(items) == 1


async def test_chat_with_active_lead_marked_as_lead(list_client, clean_db):
    """Баг A: чат, созданный после отправки сообщения лиду (без linked_lead_id),
    распознаётся как лид по телефону — source='lead' + linked_lead_id."""
    await _seed_lead(clean_db, "+77051234567", "Иван", "Петров")
    # Симулируем: лиду уже написали (есть чат по номеру), но чат не линкован к лиду.
    await _seed_chat(clean_db, "+77051234567", "Иван Петров")
    async with list_client as c:
        r = await c.get("/api/wazzup/chats")
    assert r.status_code == 200
    items = r.json()["chats"]
    assert len(items) == 1
    assert items[0]["source"] == "lead"
    assert items[0]["linked_lead_id"]
    assert not items[0].get("patient_id")


async def test_converted_lead_not_shown_as_lead(list_client, clean_db):
    """Баг C: конвертированный лид (есть пациент) не показывается как «новый лид»."""
    await _seed_lead(clean_db, "+77051234567", "Иван", "Петров", converted=True)
    async with list_client as c:
        r = await c.get("/api/wazzup/chats")
    assert r.status_code == 200
    items = r.json()["chats"]
    assert all(i.get("source") != "lead" for i in items), "конвертированный лид не должен быть в ленте лидов"