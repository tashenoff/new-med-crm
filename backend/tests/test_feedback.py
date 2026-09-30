"""Feedback module (оценка пациента от 1 до 10).

После завершения приёма шлём запрос оценки (правило appointment_completed).
Пациент отвечает баллом → ветвление: хороший (>= good_score_min) → ссылка на
отзыв; плохой → просим описать причины → сохраняем в CRM (patient_feedback).

Всё это интерактив, входная точка — входящий вебхук WhatsApp.
"""

import os

os.environ.setdefault("WAZZUP24_API_KEY", "test-key-for-tests")


async def _seed_patient_and_doctor(clean_db):
    await clean_db.patients.insert_one({"id": "p1", "full_name": "Иван Петров", "phone": "87771234567"})
    await clean_db.doctors.insert_one({"id": "d1", "full_name": "Доктор Иванова"})


def _appt(status="no_show", date="2026-10-01", time="14:30"):
    return {
        "id": "a1", "patient_id": "p1", "doctor_id": "d1",
        "appointment_date": date, "appointment_time": time, "status": status,
    }


async def test_settings_return_defaults_when_absent(clean_db):
    from services.feedback_service import FeedbackService
    s = await FeedbackService(clean_db).get_settings()
    assert s.good_score_min == 8
    assert s.review_link


async def test_settings_update_persists(clean_db):
    from services.feedback_service import FeedbackService
    svc = FeedbackService(clean_db)
    updated = await svc.update_settings({"good_score_min": 6})
    assert updated.good_score_min == 6
    got = await svc.get_settings()
    assert got.good_score_min == 6


async def test_completed_appointment_starts_survey(clean_db):
    from services.feedback_service import FeedbackService
    await _seed_patient_and_doctor(clean_db)
    svc = FeedbackService(clean_db)
    await svc.start_survey(_appt(), patient_name="Иван Петров", phone="87771234567", doctor_name="Доктор Иванова")
    rec = await clean_db.patient_feedback.find_one({"patient_id": "p1", "appointment_id": "a1"})
    assert rec is not None
    assert rec["status"] == "pending_score"


async def test_good_score_sends_review_link(clean_db, monkeypatch):
    from services.feedback_service import FeedbackService
    svc = FeedbackService(clean_db)
    await svc.start_survey(_appt(), "Иван Петров", "87771234567", "Доктор Иванова")

    reply = await svc.handle_incoming("87771234567", "9")  # хороший балл
    assert reply["consumed"] is True
    assert reply["reply"] is not None
    assert reply["reply"]["phone"] == "87771234567"
    assert "9" in reply["reply"]["text"]
    assert "http" in reply["reply"]["text"]  # ссылка на отзыв

    rec = await clean_db.patient_feedback.find_one({"appointment_id": "a1"})
    assert rec["status"] == "good"
    assert rec["score"] == 9


async def test_bad_score_asks_for_reason_then_saves(clean_db):
    from services.feedback_service import FeedbackService
    svc = FeedbackService(clean_db)
    await svc.start_survey(_appt(), "Иван Петров", "87771234567", "Доктор Иванова")

    reply = await svc.handle_incoming("87771234567", "3")  # плохой балл
    assert reply["consumed"] is True
    assert reply["reply"] is not None
    assert "причин" in reply["reply"]["text"].lower() or "опис" in reply["reply"]["text"].lower()

    rec = await clean_db.patient_feedback.find_one({"appointment_id": "a1"})
    assert rec["status"] == "pending_reason"
    assert rec["score"] == 3

    # Пациент описывает причину
    reply2 = await svc.handle_incoming("87771234567", "очень долго ждал записи")
    assert reply2["consumed"] is True
    assert reply2["reply"] is None  # никакого исходящего, просто сохранили

    rec2 = await clean_db.patient_feedback.find_one({"appointment_id": "a1"})
    assert rec2["status"] == "bad"
    assert "долго ждал" in rec2["reason"]


async def test_non_numeric_reply_keeps_pending(clean_db):
    from services.feedback_service import FeedbackService
    svc = FeedbackService(clean_db)
    await svc.start_survey(_appt(), "Иван Петров", "87771234567", "Доктор Иванова")

    reply = await svc.handle_incoming("87771234567", "привет")
    assert reply["consumed"] is True   # это ответ на опрос (лид не создаётся)
    assert reply["reply"] is None      # не число — исходящего нет
    rec = await clean_db.patient_feedback.find_one({"appointment_id": "a1"})
    assert rec["status"] == "pending_score"
    assert rec.get("score") is None


async def test_no_pending_survey_no_reply(clean_db):
    from services.feedback_service import FeedbackService
    reply = await FeedbackService(clean_db).handle_incoming("87770000000", "5")
    assert reply["consumed"] is False
    assert reply["reply"] is None


async def test_ensure_completed_rule_creates_once(clean_db):
    from services.feedback_service import FeedbackService
    svc = FeedbackService(clean_db)
    await svc.ensure_completed_rule()
    await svc.ensure_completed_rule()
    n = await clean_db.notification_rules.count_documents({"trigger": "appointment_completed"})
    assert n == 1