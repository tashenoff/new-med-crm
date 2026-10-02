"""Исходящее сообщение (отправка из инбокса) должно создавать/обновлять чат.

send_message (Wazzup24 outbound) апдейтит wazzup_chats: last_message/text,
сбрасывает unread_count. Без этого список инбокса не видит исходящие.
"""
import os

os.environ.setdefault("WAZZUP24_API_KEY", "test-key-for-tests")

import pytest  # noqa: E402


@pytest.fixture
def chirp(clean_db, monkeypatch):
    from routers.wazzup import wazzup_service

    async def fake_request(method, endpoint, data=None, params=None):
        return {"messageId": "m-out-1"}

    monkeypatch.setattr("database.db", clean_db)
    monkeypatch.setattr(wazzup_service, "_make_request", fake_request)
    return wazzup_service


async def test_outgoing_send_upserts_chat(chirp, clean_db):
    from models.wazzup import SendMessageRequest

    await chirp.send_message(SendMessageRequest(phone="+77771234567", text="Записан", channel_id="ch1"))

    chat = await clean_db.wazzup_chats.find_one({"phone": "+77771234567"})
    assert chat is not None, "исходящее должно создать чат"
    assert chat["last_message"] == "Записан"
    assert chat["unread_count"] == 0

    # Повторная отправка — апдейт, а не новый документ
    await chirp.send_message(SendMessageRequest(phone="+77771234567", text="Второе", channel_id="ch1"))
    assert await clean_db.wazzup_chats.count_documents({"phone": "+77771234567"}) == 1
    chat2 = await clean_db.wazzup_chats.find_one({"phone": "+77771234567"})
    assert chat2["last_message"] == "Второе"


async def test_send_media_records_history_and_chat(chirp, clean_db):
    from models.wazzup import MessageType

    await chirp.send_media(
        phone="+77771234567",
        media_url="http://test/uploads/wazzup_x.pdf",
        media_type=MessageType.DOCUMENT,
        caption="Ваш результат",
        channel_id="ch1",
    )

    chat = await clean_db.wazzup_chats.find_one({"phone": "+77771234567"})
    assert chat is not None, "отправка медиа должна создать/обновить чат"
    assert chat["last_message"] == "Ваш результат"

    msg = await clean_db.wazzup_messages.find_one({"phone": "+77771234567"})
    assert msg is not None, "медиа должно сохраниться в историю"
    assert msg["message_type"] == "document"
    assert msg["direction"] == "outgoing"
    assert msg["media_url"] == "http://test/uploads/wazzup_x.pdf"


async def test_send_media_adds_to_patient_documents(chirp, clean_db, monkeypatch):
    """Исходящий файл из чата, связанного с пациентом, попадает в его Документы."""
    import os
    from datetime import datetime
    from models.wazzup import MessageType

    await clean_db.patients.insert_one({
        "id": "p-doc", "full_name": "Иван", "phone": "87771234567", "iin": "",
        "revenue": 0.0, "debt": 0.0, "overpayment": 0.0,
        "appointments_count": 0, "records_count": 0,
    })
    await clean_db.wazzup_chats.insert_one({
        "phone": "+77771234567", "contact_name": "Иван", "channel_id": "ch1",
        "last_message": "", "last_message_time": datetime(2026, 10, 2, 9, 0),
        "unread_count": 0, "status": "new", "linked_patient_id": "p-doc",
    })
    os.makedirs("uploads", exist_ok=True)
    open("uploads/wazzup_doc1.pdf", "wb").write(b"%PDF test")
    try:
        await chirp.send_media(
            phone="87771234567",
            media_url="https://x/uploads/wazzup_doc1.pdf",
            media_type=MessageType.DOCUMENT,
            channel_id="ch1",
        )
    finally:
        if os.path.exists("uploads/wazzup_doc1.pdf"):
            os.remove("uploads/wazzup_doc1.pdf")

    doc = await clean_db.documents.find_one({"patient_id": "p-doc"})
    assert doc is not None, "файл должен попасть в документы пациента"
    assert doc["filename"] == "wazzup_doc1.pdf"
    assert doc["file_type"] == "document"
    assert doc["uploaded_by_name"] == "WhatsApp-отправка"

