"""Голосовые (audio) из WhatsApp НЕ попадают в Документы пациента; image/video/document — попадают.

Решение alex (03.10.2026): входящее голосовое скачивается локально для проигрывания
в переписке, но не дублируется в раздел «Документы» карточки пациента.
"""
import os

os.environ.setdefault("WAZZUP24_API_KEY", "test-key-for-tests")

import pytest  # noqa: E402


@pytest.fixture
def doc_probe(clean_db, monkeypatch):
    """Проксирует медиа-ветку вебхука: get_chat даёт пациента, add_patient_file пишет лог."""
    import asyncio
    from httpx import AsyncClient, ASGITransport
    import server
    import routers.wazzup as wazzup_router
    from crm.services import lead_service as lead_service_mod

    monkeypatch.setattr(wazzup_router, "_trigger_auto_ai_analysis", lambda *a, **k: asyncio.sleep(0))
    monkeypatch.setattr(wazzup_router.wazzup_service, "save_message_to_db", lambda *a, **k: None)

    calls = []

    class _FakeChatSvc:
        def __init__(self, db):
            pass

        async def get_chat(self, phone):
            return {"patient_id": "p1", "phone": phone}

        async def upsert_incoming(self, **kw):
            return None

    monkeypatch.setattr("services.wazzup_chat_service.WazzupChatService", _FakeChatSvc)

    class _FakeDocumentService:
        def __init__(self, *a, **k):
            pass

        async def add_patient_file(self, **kw):
            calls.append(kw)

    monkeypatch.setattr("services.document_service.DocumentService", _FakeDocumentService)

    class _ExistingLead:
        id = "lead1"
        status = "in_progress"

        def __init__(self, db):
            pass

        async def get_active_lead_by_phone(self, phone):
            return _ExistingLead

    monkeypatch.setattr(lead_service_mod, "LeadService", _ExistingLead)
    monkeypatch.setattr("database.db", clean_db)

    transport = ASGITransport(app=server.app)
    client = AsyncClient(transport=transport, base_url="http://test")
    client.calls = calls
    return client


async def _post_media(client, msg_type, content_uri):
    payload = {
        "messages": [
            {
                "messageId": "mx",
                "channelId": "ch1",
                "chatId": "77771234567",
                "type": msg_type,
                "isEcho": False,
                "text": "",
                "contentUri": content_uri,
            }
        ]
    }
    return await client.post("/api/wazzup/webhook/messages", json=payload)


@pytest.mark.parametrize("media_type,uri", [("audio", "/uploads/voice_test.opus"), ("ptt", "/uploads/v.ogg")])
async def test_voice_variants_not_saved_to_patient_documents(doc_probe, media_type, uri):
    """audio/ptt (голосовые) скачиваются, но НЕ пишутся в документы пациента."""
    async with doc_probe as client:
        r = await _post_media(client, media_type, uri)
    assert r.status_code == 200
    assert client.calls == [], f"add_patient_file не должен вызываться для {media_type}, вызван: {client.calls}"


@pytest.mark.parametrize(
    "media_type,uri",
    [("image", "/uploads/i.png"), ("video", "/uploads/v.mp4"),
     ("document", "/uploads/doc.pdf"), ("audio", "/uploads/v.opus")],
)
async def test_media_not_auto_saved_to_patient_documents(doc_probe, media_type, uri):
    """Любое входящее медиа НЕ попадает в документы автоматически (ручное сохранение).

    Решение alex (2026-10): файл локализуется для проигрывания, но менеджер
    сохраняет его в карточку пациента по клику (POST /save-to-patient).
    """
    async with doc_probe as client:
        r = await _post_media(client, media_type, uri)
    assert r.status_code == 200
    assert client.calls == [], f"add_patient_file не должен вызываться для {media_type}, вызван: {client.calls}"