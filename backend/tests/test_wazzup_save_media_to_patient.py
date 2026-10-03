"""Сохранить входящее медиа из WhatsApp в Документы пациента — вручную, по клику.

Решение alex: входящий документ/картинка/видео/голосовое НЕ сохраняются в карточку
автоматически. Менеджер жмёт «сохранить» в виджете → POST /wazzup/messages/{id}/save-to-patient.
"""
import os

os.environ.setdefault("WAZZUP24_API_KEY", "test-key-for-tests")

import pytest  # noqa: E402

import uuid  # noqa: E402
from datetime import datetime  # noqa: E402


@pytest.fixture
def save_client(clean_db, monkeypatch):
    from httpx import AsyncClient, ASGITransport
    import server
    import routers.wazzup as wazzup_router

    class _FakeUser:
        id = "mgr1"
        role = "admin"
        is_active = True
        email = "admin@test.ru"

    # Не ходим в сеть при локализации входящего (не нужна здесь).
    async def _no_local(*a, **k):
        return None

    monkeypatch.setattr(wazzup_router, "_trigger_auto_ai_analysis", lambda *a, **k: None)
    monkeypatch.setattr("database.db", clean_db)
    server.app.dependency_overrides[wazzup_router.get_current_user] = lambda: _FakeUser()
    transport = ASGITransport(app=server.app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _seed_patient(db, phone, name="Иван Петров"):
    pid = "pat_" + uuid.uuid4().hex[:8]
    await db.patients.insert_one({"id": pid, "full_name": name, "phone": phone})
    return pid


async def _seed_chat(db, phone, patient_id):
    from services.wazzup_chat_service import WazzupChatService
    await WazzupChatService(db).upsert_incoming(
        phone=phone, contact_name="Иван", text="doc", channel_id="ch1", ts=datetime.now(),
    )
    await db.wazzup_chats.update_one({"phone": WazzupChatService._norm_phone(phone)},
                                     {"$set": {"linked_patient_id": patient_id, "patient_name": "Иван Петров"}})


async def _seed_message(db, message_id, phone, media_url="/uploads/wazzup_abc.pdf", mtype="document", direction="incoming"):
    await db.wazzup_messages.insert_one({
        "message_id": message_id,
        "phone": phone,
        "chat_id": "".join(c for c in phone if c.isdigit()).lstrip("8") + "@c.us",
        "message_type": mtype,
        "media_url": media_url,
        "direction": direction,
        "metadata": {"filename": "analiz.pdf"},
        "timestamp": datetime.utcnow(),
        "created_at": datetime.utcnow(),
    })


async def test_incoming_media_not_saved_automatically(save_client, clean_db):
    """Входящее медиа локализуется, но НЕ появляется в документе пациента автоматически."""
    # Симулируем: вебхук-обработка уже произошла (файл локализован), чат привязан к пациенту.
    pid = await _seed_patient(clean_db, "+77051234567")
    await _seed_chat(clean_db, "+77051234567", pid)
    await _seed_message(clean_db, "m1", "+77051234567")

    docs = await clean_db.documents.find_one({"patient_id": pid})
    assert docs is None, "без ручного клика документ НЕ должен создаваться"


async def test_save_media_to_patient_creates_document(save_client, clean_db, monkeypatch, tmp_path):
    """Ручное сохранение кладёт файл в документы пациента и ставит флаг saved_to_patient."""
    # Подменяем add_patient_file, чтобы не трогать реальный диск (файла нет).
    saved = {}
    class _FakeDocService:
        def __init__(self, *a, **k):
            pass
        async def add_patient_file(self, **kw):
            saved.update(kw)
            from models.document import Document
            return Document(id="doc1", patient_id=kw["patient_id"], filename=kw["src_filename"],
                            original_filename=kw["original_filename"], file_path="x",
                            file_size=1, file_type=kw["content_type"],
                            uploaded_by=kw["uploaded_by"], uploaded_by_name=kw["uploaded_by_name"])
    monkeypatch.setattr("services.document_service.DocumentService", _FakeDocService)

    pid = await _seed_patient(clean_db, "+77051234567")
    await _seed_chat(clean_db, "+77051234567", pid)
    await _seed_message(clean_db, "m2", "+77051234567")

    async with save_client as c:
        r = await c.post("/api/wazzup/messages/m2/save-to-patient")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["saved"] is True
    assert data["patient_id"] == pid
    assert saved["patient_id"] == pid
    assert saved["src_filename"] == "wazzup_abc.pdf"
    # Флаг сохранения на сообщении
    msg = await clean_db.wazzup_messages.find_one({"message_id": "m2"})
    assert msg.get("saved_to_patient") is True


async def test_save_media_without_patient_returns_400(save_client, clean_db):
    """Если к чату не привязан пациент — 400, файл не сохраняется."""
    await _seed_patient(clean_db, "+77051234567")  # пациент есть, но чат НЕ привязан
    await _seed_message(clean_db, "m3", "+77051234567")
    async with save_client as c:
        r = await c.post("/api/wazzup/messages/m3/save-to-patient")
    assert r.status_code == 400