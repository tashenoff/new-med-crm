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

