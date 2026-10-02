"""Роуты WhatsApp-инбокса: список чатов и смена статуса/привязок.

Список сортируется по last_message_time (новые сверху), фильтруется по статусу,
менеджеру и поиску. PATCH статуса держит чат и привязанный лид синхронно
(статус чата = статус лида, воронка реюзится).
"""
import os

os.environ.setdefault("WAZZUP24_API_KEY", "test-key-for-tests")

import pytest  # noqa: E402
from datetime import datetime  # noqa: E402


@pytest.fixture
def auth_client(clean_db, monkeypatch):
    from httpx import AsyncClient, ASGITransport
    from dependencies import get_current_user
    import server

    class _FakeUser:
        id = "u1"
        role = "admin"
        is_active = True
        email = "admin@test.ru"

    monkeypatch.setattr("database.db", clean_db)
    server.app.dependency_overrides[get_current_user] = lambda: _FakeUser()
    try:
        transport = ASGITransport(app=server.app)
        yield AsyncClient(transport=transport, base_url="http://test")
    finally:
        server.app.dependency_overrides.pop(get_current_user, None)


async def _seed(clean_db, phone, name, last_msg, ts, status="new", **extra):
    doc = {
        "phone": phone,
        "contact_name": name,
        "channel_id": "ch1",
        "last_message": last_msg,
        "last_message_time": ts,
        "unread_count": 0,
        "status": status,
        **extra,
    }
    r = await clean_db.wazzup_chats.insert_one(doc)
    return str(r.inserted_id)


async def test_list_chats_sorted_and_filtered(clean_db, auth_client):
    await _seed(clean_db, "+77770000001", "Иван", "старое", datetime(2026, 10, 1, 9, 0), "new")
    await _seed(clean_db, "+77770000002", "Мария", "новое", datetime(2026, 10, 2, 9, 0), "contacted")
    await _seed(clean_db, "+77770000003", "Игорь", "среднее", datetime(2026, 10, 1, 12, 0), "new")

    r = await auth_client.get("/api/wazzup/chats")
    assert r.status_code == 200
    chats = r.json()["chats"]
    assert [ch["phone"] for ch in chats] == ["+77770000002", "+77770000003", "+77770000001"], "сортировка по времени, новые сверху"

    r = await auth_client.get("/api/wazzup/chats", params={"status": "new"})
    assert [ch["phone"] for ch in r.json()["chats"]] == ["+77770000003", "+77770000001"]

    r = await auth_client.get("/api/wazzup/chats", params={"search": "Мар"})
    assert [ch["phone"] for ch in r.json()["chats"]] == ["+77770000002"]


async def test_patch_status_syncs_linked_lead(clean_db, auth_client):
    # Создаём лид и чат, залинкованный на него
    lead_doc = {
        "id": "lead-uuid-1",
        "first_name": "Иван",
        "phone": "77770000001",
        "status": "new",
        "source": "social",
    }
    await clean_db.crm_leads.insert_one(lead_doc)
    await _seed(clean_db, "+77770000001", "Иван", "привет", datetime(2026, 10, 2, 9, 0), "new", linked_lead_id="lead-uuid-1")

    r = await auth_client.patch("/api/wazzup/chats/+77770000001", json={"status": "contacted"})
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "contacted"

    chat = await clean_db.wazzup_chats.find_one({"phone": "+77770000001"})
    lead = await clean_db.crm_leads.find_one({"id": "lead-uuid-1"})
    assert chat["status"] == "contacted"
    assert lead["status"] == "contacted"


async def test_patch_assigns_manager(clean_db, auth_client):
    await _seed(clean_db, "+77770000001", "Иван", "привет", datetime(2026, 10, 2, 9, 0), "new")

    r = await auth_client.patch("/api/wazzup/chats/+77770000001", json={"assigned_manager_id": "mgr-9"})
    assert r.status_code == 200
    chat = await clean_db.wazzup_chats.find_one({"phone": "+77770000001"})
    assert chat["assigned_manager_id"] == "mgr-9"


async def test_get_chat_enriches_existing_patient(clean_db, auth_client):
    # Существующий пациент в CRM; чат изначально без привязки.
    await clean_db.patients.insert_one({
        "id": "pat-uuid-1",
        "full_name": "Иван Петрович",
        "phone": "87771234567",
        "iin": "",
    })
    from datetime import datetime
    await _seed(clean_db, "+77771234567", "Иван", "привет", datetime(2026, 10, 2, 9, 0), "new")

    r = await auth_client.get("/api/wazzup/chats/+77771234567")
    assert r.status_code == 200
    data = r.json()
    # Пациент найден по телефону (разные форматы +7/8) и залинкован
    assert data["patient_id"] == "pat-uuid-1"
    assert data["patient_name"] == "Иван Петрович"
    assert data["patient_phone"] == "87771234567"

    chat = await clean_db.wazzup_chats.find_one({"phone": "+77771234567"})
    assert chat["linked_patient_id"] == "pat-uuid-1"


async def test_get_chat_without_patient_no_id(clean_db, auth_client):
    from datetime import datetime
    await _seed(clean_db, "+77779999999", "Новичок", "hi", datetime(2026, 10, 2, 9, 0), "new")
    r = await auth_client.get("/api/wazzup/chats/+77779999999")
    assert r.status_code == 200
    assert r.json()["patient_id"] is None

