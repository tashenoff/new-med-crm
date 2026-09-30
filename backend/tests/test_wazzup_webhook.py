"""Вебхук Wazzup v3: новый формат messages[] должен попадать в опрос обратной связи.

Тест бьёт в реальный роут через httpx ASGITransport, но подменяет внешние
зависимости (БД-сохранение, лиды, AI), чтобы проверить только маршрутизацию
формата тела. Опрос и его матчинг идут по настоящей FeedbackService + medcrm_test.
"""
import os

os.environ.setdefault("WAZZUP24_API_KEY", "test-key-for-tests")

import pytest


@pytest.fixture
def webhook_client(clean_db, monkeypatch):
    import asyncio
    from httpx import AsyncClient, ASGITransport
    import server
    import routers.wazzup as wazzup_router
    from crm.services import lead_service as lead_service_mod

    monkeypatch.setattr(wazzup_router, "_trigger_auto_ai_analysis", lambda *a, **k: asyncio.sleep(0))

    async def _no_save(*a, **k):
        return None

    monkeypatch.setattr(wazzup_router.wazzup_service, "save_message_to_db", _no_save)

    class _NoLead:
        def __init__(self, db):
            pass

        async def get_active_lead_by_phone(self, phone):
            return None

        async def create_lead(self, *a, **k):
            raise AssertionError("лид не должен создаваться для ответа на опрос")

    monkeypatch.setattr(lead_service_mod, "LeadService", _NoLead)
    monkeypatch.setattr("database.db", clean_db)

    transport = ASGITransport(app=server.app)
    return AsyncClient(transport=transport, base_url="http://test")


async def test_v3_messages_payload_records_score(clean_db, webhook_client):
    from services.feedback_service import FeedbackService

    svc = FeedbackService(clean_db)
    await svc.start_survey(
        {"id": "a1", "patient_id": "p1"}, "Иван", "87771234567", "Доктор"
    )

    payload = {
        "messages": [
            {
                "messageId": "m1",
                "channelId": "ch1",
                "chatType": "whatsapp",
                "chatId": "77771234567",
                "dateTime": "2026-09-30T12:10:00.000Z",
                "type": "text",
                "isEcho": False,
                "contact": {"name": "Иван"},
                "text": "9",
                "status": "inbound",
            }
        ]
    }
    async with webhook_client as client:
        r = await client.post("/api/wazzup/webhook/messages", json=payload)
    assert r.status_code == 200

    rec = await clean_db.patient_feedback.find_one({"appointment_id": "a1"})
    assert rec["status"] == "good"
    assert rec["score"] == 9


async def test_v3_echo_and_statuses_are_ignored(clean_db, webhook_client):
    """Исходящее эхо и статусы не должны создавать опросный ответ или падать."""
    payload = {
        "messages": [
            {"messageId": "m2", "chatId": "77770000000", "type": "text",
             "isEcho": True, "text": "исходящее"}
        ],
        "statuses": [
            {"messageId": "m0", "timestamp": "2026-09-30T12:10:00.000Z", "status": "delivered"}
        ],
    }
    async with webhook_client as client:
        r = await client.post("/api/wazzup/webhook/messages", json=payload)
    assert r.status_code == 200
    assert await clean_db.patient_feedback.count_documents({}) == 0


async def test_webhook_test_ping_returns_200(webhook_client):
    """При подключении Wazzup шлёт {test: true} и требует 200."""
    async with webhook_client as client:
        r = await client.post("/api/wazzup/webhook/messages", json={"test": True})
    assert r.status_code == 200
