"""WhatsApp-инбокс: входящее сообщение через вебхук создаёт/обновляет wazzup_chats.

Ключ чата — нормализованный телефон (как в save_message_to_db). Чат линкуется
к лиду (существующему активному или только что созданному), непрочитанные
инкрементятся. Статус чата повторяет статус лида (реюз воронки).
"""
import os

os.environ.setdefault("WAZZUP24_API_KEY", "test-key-for-tests")

import pytest  # noqa: E402


@pytest.fixture
def webhook_client(clean_db, monkeypatch):
    import asyncio
    from httpx import AsyncClient, ASGITransport
    import server
    import routers.wazzup as wazzup_router

    monkeypatch.setattr(wazzup_router, "_trigger_auto_ai_analysis", lambda *a, **k: asyncio.sleep(0))

    async def _no_save(*a, **k):
        return None

    monkeypatch.setattr(wazzup_router.wazzup_service, "save_message_to_db", _no_save)
    monkeypatch.setattr("database.db", clean_db)

    transport = ASGITransport(app=server.app)
    return AsyncClient(transport=transport, base_url="http://test")


def _msg(chat_id, text, message_id, name="Иван", is_echo=False):
    return {
        "messageId": message_id,
        "channelId": "ch1",
        "chatType": "whatsapp",
        "chatId": chat_id,
        "dateTime": "2026-10-02T10:00:00.000Z",
        "type": "text",
        "isEcho": is_echo,
        "contact": {"name": name},
        "text": text,
    }


async def test_inbound_creates_chat_and_links_lead(clean_db, webhook_client):
    async with webhook_client as client:
        r = await client.post("/api/wazzup/webhook/messages", json={"messages": [_msg("77771234567", "Здравствуйте", "m-in-1")]})
        assert r.status_code == 200

    chat = await clean_db.wazzup_chats.find_one({"phone": "+77771234567"})
    assert chat is not None
    assert chat["contact_name"] == "Иван"
    assert chat["last_message"] == "Здравствуйте"
    assert chat["unread_count"] == 1

    lead = await clean_db.crm_leads.find_one({"phone": "77771234567"})
    assert lead is not None
    assert chat["linked_lead_id"] == lead["id"]
    # Статус чата повторяет статус лида (новый лид = new)
    assert chat["status"] == lead["status"]


async def test_inbound_increments_unread_and_keeps_lead(clean_db, webhook_client):
    async with webhook_client as client:
        for i in range(2):
            r = await client.post(
                "/api/wazzup/webhook/messages",
                json={"messages": [_msg("77771234567", f"msg{i}", f"m-in-{i}")]},
            )
            assert r.status_code == 200

    chats = await clean_db.wazzup_chats.count_documents({"phone": "+77771234567"})
    chat = await clean_db.wazzup_chats.find_one({"phone": "+77771234567"})
    assert chats == 1, "повторное входящее не должно плодить отдельные чат-доки"
    assert chat["unread_count"] == 2
    assert chat["last_message"] == "msg1"

    # Лид один, оба сообщения на него залинкованы
    assert await clean_db.crm_leads.count_documents({"phone": "77771234567"}) == 1


async def test_echo_is_ignored_no_chat(clean_db, webhook_client):
    async with webhook_client as client:
        r = await client.post("/api/wazzup/webhook/messages", json={"messages": [_msg("77779999999", "эхо", "m-echo", is_echo=True)]})
    assert r.status_code == 200
    assert await clean_db.wazzup_chats.count_documents({}) == 0


async def test_inbound_media_saved_to_patient_documents(clean_db, webhook_client, monkeypatch):
    """Входящий файл от клиента по WhatsApp сохраняется в документы пациента."""
    import os
    from datetime import datetime
    import routers.wazzup as wr

    await clean_db.patients.insert_one({
        "id": "p-inc", "full_name": "Клиент", "phone": "87779999999", "iin": "",
        "revenue": 0.0, "debt": 0.0, "overpayment": 0.0,
        "appointments_count": 0, "records_count": 0,
    })
    await clean_db.wazzup_chats.insert_one({
        "phone": "+77779999999", "contact_name": "Клиент", "channel_id": "ch1",
        "last_message": "", "last_message_time": datetime(2026, 10, 2, 9, 0),
        "unread_count": 0, "status": "new", "linked_patient_id": "p-inc",
    })

    class FakeResp:
        status_code = 200
        content = b"%PDF inbound"

    class FakeAC:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, url): return FakeResp()

    monkeypatch.setattr(wr.httpx, "AsyncClient", FakeAC)

    msg = {
        "messageId": "m-in-pdf",
        "channelId": "ch1",
        "chatType": "whatsapp",
        "chatId": "77779999999",
        "dateTime": "2026-10-02T10:00:00.000Z",
        "type": "document",
        "isEcho": False,
        "contact": {"name": "Клиент"},
        "text": "",
        "contentUri": "https://wazzup.cdn/files/analysis.pdf",
    }
    async with webhook_client as client:
        r = await client.post("/api/wazzup/webhook/messages", json={"messages": [msg]})
    assert r.status_code == 200

    doc = await clean_db.documents.find_one({"patient_id": "p-inc"})
    assert doc is not None, "входящий файл должен попасть в документы пациента"
    assert doc["file_type"] == "document"
    assert doc["uploaded_by_name"] == "WhatsApp (клиент)"

    # чистим скачанный файл
    fpath = os.path.join("uploads", doc["filename"])
    if os.path.exists(fpath):
        os.remove(fpath)

