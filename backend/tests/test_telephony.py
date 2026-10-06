"""
Тесты для Zadarma Telephony API (бэкенд).

Покрытие:
  - формула подписи Zadarma на фиксированном векторе
  - разбор payload события вебхука → документ telephony_calls
  - эхо zd_echo
  - матчинг телефона на существующего пациента
"""
import os

os.environ.setdefault("ZADARMA_KEY", "test-key-for-tests")
os.environ.setdefault("ZADARMA_SECRET", "test-secret-for-tests")
os.environ.setdefault("ZADARMA_CALLER_ID", "74951234567")
os.environ.setdefault("ZADARMA_SIP_INTERNAL", "100")

import hashlib
import hmac
import base64
import pytest
from urllib.parse import urlencode


# ---------------------------------------------------------------------------
# Тест формулы подписи Zadarma (изолированный, без БД и HTTP)
# ---------------------------------------------------------------------------

def _zadarma_sign_reference(method_path: str, params: dict, secret: str) -> str:
    """Эталонная реализация подписи — считается правильной."""
    sorted_params = sorted(params.items())
    params_str = urlencode(sorted_params) if sorted_params else ""
    md5_hex = hashlib.md5(params_str.encode()).hexdigest()
    data = method_path + params_str + md5_hex
    hmac_digest = hmac.new(secret.encode(), data.encode(), hashlib.sha1).hexdigest()
    return base64.b64encode(hmac_digest.encode()).decode()


def test_zadarma_sign_empty_params():
    """Подпись без параметров."""
    from services.telephony_service import _zadarma_sign

    method_path = "/v1/info/balance/"
    params = {}
    secret = "my_secret_key"

    expected = _zadarma_sign_reference(method_path, params, secret)
    result = _zadarma_sign(method_path, params, secret)
    assert result == expected, f"Подпись не совпадает: {result} != {expected}"


def test_zadarma_sign_with_params():
    """Подпись с отсортированными параметрами."""
    from services.telephony_service import _zadarma_sign

    method_path = "/v1/request/callback/"
    params = {"to": "79991234567", "from": "74951234567"}
    secret = "my_secret_key"

    expected = _zadarma_sign_reference(method_path, params, secret)
    result = _zadarma_sign(method_path, params, secret)
    assert result == expected, f"Подпись не совпадает: {result} != {expected}"


def test_zadarma_sign_known_vector():
    """Подпись на фиксированном векторе (детерминированный тест).

    Вектор:
      method_path = "/v1/test/method/"
      params = {"b": "2", "a": "1"}
      secret = "secret123"

    Вычисляем ожидаемое значение независимо — через эталонную реализацию.
    """
    from services.telephony_service import _zadarma_sign

    method_path = "/v1/test/method/"
    params = {"b": "2", "a": "1"}
    secret = "secret123"

    result = _zadarma_sign(method_path, params, secret)
    expected = _zadarma_sign_reference(method_path, params, secret)
    assert result == expected

    # Дополнительно проверяем, что подпись — корректная base64-строка
    import base64 as b64
    try:
        decoded = b64.b64decode(result)
        assert len(decoded) == 40  # SHA1 hexdigest = 40 символов
    except Exception:
        pytest.fail("Подпись не является валидной base64-строкой")


def test_zadarma_sign_deterministic():
    """Подпись должна быть детерминированной: дважды для одних данных — один результат."""
    from services.telephony_service import _zadarma_sign

    method_path = "/v1/request/callback/"
    params = {"to": "79991234567", "from": "74951234567", "sip": "100"}
    secret = "my_secret_key"

    r1 = _zadarma_sign(method_path, params, secret)
    r2 = _zadarma_sign(method_path, params, secret)
    assert r1 == r2


# ---------------------------------------------------------------------------
# Фикстура: HTTP-клиент с подменённой БД
# ---------------------------------------------------------------------------

@pytest.fixture
async def webhook_client(clean_db, monkeypatch):
    from httpx import AsyncClient, ASGITransport
    import server
    import routers.telephony as telephony_router_mod

    # Подменяем database.db на тестовую БД
    monkeypatch.setattr("database.db", clean_db)

    # Для webhook-тестов не нужен реальный Zadarma API — подменяем сервис
    class _FakeTelephonyService:
        async def get_balance(self):
            return {"status": "success", "balance": "100.50"}

        async def request_callback(self, phone, sip=None):
            return {
                "status": "success",
                "from": "74951234567",
                "to": phone,
                "time": "2026-01-01 12:00:00",
            }

    monkeypatch.setattr(
        telephony_router_mod, "telephony_service", _FakeTelephonyService()
    )

    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


# ---------------------------------------------------------------------------
# Тест эха zd_echo (GET и POST)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("method", ["GET", "POST"])
async def test_zd_echo_returns_value(webhook_client, method):
    """Zadarma проверяет URL через zd_echo. Должен вернуть то же значение."""
    from httpx import AsyncClient

    client = webhook_client
    if method == "GET":
        r = await client.get("/api/telephony/webhook/events?zd_echo=test123")
    else:
        r = await client.post(
            "/api/telephony/webhook/events",
            json={"zd_echo": "hello_world"},
        )

    assert r.status_code == 200
    # Тело должно быть ровно значением zd_echo (plain text)
    assert r.text == ("test123" if method == "GET" else "hello_world")


async def test_zd_echo_get_with_params(webhook_client):
    """GET zd_echo с дополнительными параметрами."""
    client = webhook_client
    r = await client.get(
        "/api/telephony/webhook/events?zd_echo=ping&other=param"
    )
    assert r.status_code == 200
    assert r.text == "ping"


# ---------------------------------------------------------------------------
# Тест: разбор payload вебхука → документ в telephony_calls
# ---------------------------------------------------------------------------

async def test_zd_echo_form_encoded_returns_value(webhook_client):
    """Zadarma присылает zd_echo в form-encoded теле — возвращаем plain text."""
    client = webhook_client
    r = await client.post(
        "/api/telephony/webhook/events",
        data={"zd_echo": "form_echo_123"},
    )

    assert r.status_code == 200
    assert r.text == "form_echo_123"


async def test_webhook_notify_start_form_encoded_creates_call_record(clean_db, webhook_client):
    """Событие NOTIFY_START в form-encoded теле создаёт запись звонка в БД."""
    payload = {
        "event": "NOTIFY_START",
        "caller_id": "+77771234567",
        "call_id": "test-form-1",
        "internal": "100",
        "pbx_call_id": "test-form-1",
    }

    client = webhook_client
    r = await client.post(
        "/api/telephony/webhook/events",
        data=payload,
    )

    assert r.status_code == 200
    assert r.json() == {"status": "ok"}

    call = await clean_db.telephony_calls.find_one({"pbx_call_id": "test-form-1"})
    assert call is not None
    assert call["phone_number"] == "+77771234567"
    assert call["normalized_phone"] == "7771234567"
    assert call["direction"] == "inbound"
    assert call["status"] == "missed"


async def test_webhook_notify_start_creates_call_record(clean_db, webhook_client):
    """Событие NOTIFY_START создаёт запись звонка в БД."""
    payload = {
        "event": "NOTIFY_START",
        "caller_id": "79991234567",
        "pbx_call_id": "call-001",
        "call_id": "call-001",
        "internal": "100",
        "from": "74951234567",
        "to": "79991234567",
    }

    client = webhook_client
    r = await client.post("/api/telephony/webhook/events", json=payload)

    assert r.status_code == 200
    assert r.json() == {"status": "ok"}

    # Проверяем запись в БД
    call = await clean_db.telephony_calls.find_one({"pbx_call_id": "call-001"})
    assert call is not None
    assert call["phone_number"] == "79991234567"
    assert call["direction"] == "inbound"
    assert call["status"] == "missed"
    assert call["normalized_phone"] == "9991234567"  # последние 10 цифр от 79991234567


async def test_webhook_notify_answer_updates_call(clean_db, webhook_client):
    """Событие NOTIFY_ANSWER обновляет статус существующего звонка."""
    # Сначала создаём запись через NOTIFY_START
    start_payload = {
        "event": "NOTIFY_START",
        "caller_id": "79991234567",
        "pbx_call_id": "call-002",
        "internal": "100",
        "from": "74951234567",
        "to": "79991234567",
    }
    client = webhook_client
    await client.post("/api/telephony/webhook/events", json=start_payload)

    # Теперь NOTIFY_ANSWER
    answer_payload = {
        "event": "NOTIFY_ANSWER",
        "caller_id": "79991234567",
        "pbx_call_id": "call-002",
        "from": "74951234567",
        "to": "79991234567",
    }
    client = webhook_client
    r = await client.post("/api/telephony/webhook/events", json=answer_payload)

    assert r.status_code == 200

    call = await clean_db.telephony_calls.find_one({"pbx_call_id": "call-002"})
    assert call is not None
    assert call["status"] == "answered"


async def test_webhook_notify_end_with_disposition(clean_db, webhook_client):
    """NOTIFY_END с disposition="answered" + duration."""
    payload = {
        "event": "NOTIFY_END",
        "caller_id": "79991234567",
        "pbx_call_id": "call-003",
        "disposition": "answered",
        "duration": "45",
        "is_recorded": "1",
        "from": "74951234567",
        "to": "79991234567",
    }

    client = webhook_client
    r = await client.post("/api/telephony/webhook/events", json=payload)

    assert r.status_code == 200

    call = await clean_db.telephony_calls.find_one({"pbx_call_id": "call-003"})
    assert call is not None
    assert call["status"] == "answered"
    assert call["duration"] == 45
    assert call["disposition"] == "answered"
    assert call["is_recorded"] is False  # NOTIFY_RECORD отдельно


async def test_webhook_notify_record_adds_recording(clean_db, webhook_client):
    """NOTIFY_RECORD добавляет URL записи."""
    # Создаём звонок
    await clean_db.telephony_calls.insert_one({
        "pbx_call_id": "call-004",
        "phone_number": "79991234567",
        "direction": "inbound",
        "status": "answered",
        "duration": 30,
        "created_at": "2026-01-01T00:00:00",
    })

    payload = {
        "event": "NOTIFY_RECORD",
        "pbx_call_id": "call-004",
        "caller_id": "79991234567",
        "recording_url": "https://api.zadarma.com/v1/record/12345.mp3",
    }

    client = webhook_client
    r = await client.post("/api/telephony/webhook/events", json=payload)

    assert r.status_code == 200

    call = await clean_db.telephony_calls.find_one({"pbx_call_id": "call-004"})
    assert call is not None
    assert call["recording_url"] == "https://api.zadarma.com/v1/record/12345.mp3"
    assert call["is_recorded"] is True


async def test_webhook_unknown_event_returns_ok(webhook_client):
    """Неизвестное событие не должно валить обработчик."""
    payload = {
        "event": "NOTIFY_UNKNOWN",
        "some_data": "value",
    }

    client = webhook_client
    r = await client.post("/api/telephony/webhook/events", json=payload)

    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


async def test_webhook_no_event_no_echo_returns_ok(webhook_client):
    """Если нет ни zd_echo, ни event — возвращаем ok."""
    payload = {"irrelevant": "data"}

    client = webhook_client
    r = await client.post("/api/telephony/webhook/events", json=payload)

    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Тест: матчинг телефона на существующего пациента
# ---------------------------------------------------------------------------

async def test_webhook_matches_existing_patient(clean_db, webhook_client):
    """Если пациент с таким телефоном уже есть — звонок привязывается к нему."""
    # Создаём пациента в БД
    patient = {
        "id": "patient-001",
        "first_name": "Иван",
        "last_name": "Петров",
        "phone": "+7 (999) 123-45-67",
    }
    await clean_db.patients.insert_one(patient)

    payload = {
        "event": "NOTIFY_START",
        "caller_id": "+79991234567",
        "pbx_call_id": "call-patient-001",
        "from": "74951234567",
        "to": "79991234567",
    }

    client = webhook_client
    r = await client.post("/api/telephony/webhook/events", json=payload)

    assert r.status_code == 200

    call = await clean_db.telephony_calls.find_one({"pbx_call_id": "call-patient-001"})
    assert call is not None
    # Должен быть привязан к пациенту
    assert call["patient_id"] == "patient-001"


async def test_webhook_creates_lead_for_unknown_number(clean_db, webhook_client):
    """Если пациента нет — создаётся лид через LeadService."""
    # Не создаём пациента — лид должен создаться автоматически

    payload = {
        "event": "NOTIFY_START",
        "caller_id": "79990000001",
        "pbx_call_id": "call-lead-001",
        "from": "74951234567",
        "to": "79990000001",
    }

    client = webhook_client
    r = await client.post("/api/telephony/webhook/events", json=payload)

    assert r.status_code == 200

    # Проверяем, что создался лид
    lead = await clean_db.crm_leads.find_one({"phone": {"$regex": "79990000001"}})
    assert lead is not None, "Лид должен быть создан"
    assert lead["source"] == "phone"

    # Звонок должен быть привязан к лиду
    call = await clean_db.telephony_calls.find_one({"pbx_call_id": "call-lead-001"})
    assert call is not None
    assert call["lead_id"] == lead["id"]


async def test_normalize_phone_helper():
    """Нормализация телефона: оставляет последние 10 цифр."""
    from routers.telephony import _normalize_phone

    assert _normalize_phone("+7 (999) 123-45-67") == "9991234567"  # последние 10
    assert _normalize_phone("89991234567") == "9991234567"  # последние 10 цифр (11-значный)
    assert _normalize_phone("12345") == "12345"  # меньше 10 — как есть
    assert _normalize_phone("") == ""
    assert _normalize_phone("abc") == ""


# ---------------------------------------------------------------------------
# Тест: health-check (без реальных ключей не падает)
# ---------------------------------------------------------------------------

async def test_health_endpoint(clean_db, webhook_client):
    """GET /health возвращает статус (может быть unhealthy без реального API)."""
    client = webhook_client
    r = await client.get("/api/telephony/health")

    assert r.status_code == 200
    data = r.json()
    assert "status" in data
    assert "api_base" in data
    assert data["api_base"] == "https://api.zadarma.com"


# ---------------------------------------------------------------------------
# Тест: сервис лениво валидирует credentials
# ---------------------------------------------------------------------------

def test_telephony_service_lazy_validation():
    """Сервис не падает на импорте, если ключей нет — только при вызове API."""
    from services.telephony_service import TelephonyService

    # Очищаем env для этого теста
    saved_key = os.environ.pop("ZADARMA_KEY", None)
    saved_secret = os.environ.pop("ZADARMA_SECRET", None)

    try:
        svc = TelephonyService()
        # Не должно быть ошибки при инициализации
        assert svc is not None

        # А вот при попытке использовать — должна быть HTTPException
        import pytest
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            svc._ensure_credentials()
        assert exc_info.value.status_code == 500
        assert "ZADARMA_KEY" in exc_info.value.detail
    finally:
        if saved_key:
            os.environ["ZADARMA_KEY"] = saved_key
        if saved_secret:
            os.environ["ZADARMA_SECRET"] = saved_secret



# ---------------------------------------------------------------------------
# Тест: история звонков не падает 500, если _id — настоящий ObjectId
# ---------------------------------------------------------------------------

@pytest.fixture
def auth_client(clean_db, monkeypatch):
    from httpx import AsyncClient, ASGITransport
    from dependencies import get_current_user
    import server

    class _FakeUser:
        id = "u1"
        full_name = "Test Admin"
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


async def test_get_calls_with_real_objectid(clean_db, auth_client):
    """Регрессия: GET /api/telephony/calls должен отдавать звонки с ObjectId _id без 500."""
    from bson import ObjectId
    from datetime import datetime, timezone

    doc = {
        "_id": ObjectId("6ac4ed3c9d8f1d915cc67642"),
        "phone_number": "+79991234567",
        "normalized_phone": "9991234567",
        "direction": "inbound",
        "status": "answered",
        "disposition": "answered",
        "duration": 42,
        "recording_url": "https://example.com/rec.mp3",
        "created_at": datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, 12, 0, 42, tzinfo=timezone.utc),
        "pbx_call_id": "regression-call-001",
    }
    await clean_db.telephony_calls.insert_one(doc)

    client = auth_client
    r = await client.get("/api/telephony/calls")
    assert r.status_code == 200, f"Ожидали 200, получили {r.status_code}: {r.text}"

    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    found = [c for c in data if c.get("pbx_call_id") == "regression-call-001"]
    assert len(found) == 1, "Звонок с ObjectId _id должен присутствовать в ответе"
    assert found[0]["phone_number"] == "+79991234567"


# ---------------------------------------------------------------------------
# Тесты: contact_name подтягивается из пациента или лида
# ---------------------------------------------------------------------------

async def test_get_calls_contact_name_from_patient(clean_db, auth_client):
    """Пациент с телефоном + звонок с этим номером → contact_name = ФИО пациента."""
    from datetime import datetime, timezone

    await clean_db.patients.insert_one({
        "id": "patient-contact-001",
        "full_name": "Анна Сергеевна Волкова",
        "phone": "+7 (900) 111-22-33",
    })

    await clean_db.telephony_calls.insert_one({
        "phone_number": "+79001112233",
        "normalized_phone": "9001112233",
        "direction": "inbound",
        "status": "missed",
        "duration": 0,
        "created_at": datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        "pbx_call_id": "contact-patient-001",
    })

    client = auth_client
    r = await client.get("/api/telephony/calls")
    assert r.status_code == 200

    found = [c for c in r.json() if c.get("pbx_call_id") == "contact-patient-001"]
    assert len(found) == 1
    assert found[0]["contact_name"] == "Анна Сергеевна Волкова"


async def test_get_calls_contact_name_empty_for_unknown_number(clean_db, auth_client):
    """Звонок с неизвестным номером → contact_name пустой."""
    from datetime import datetime, timezone

    await clean_db.telephony_calls.insert_one({
        "phone_number": "+79002223344",
        "normalized_phone": "9002223344",
        "direction": "inbound",
        "status": "missed",
        "duration": 0,
        "created_at": datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        "pbx_call_id": "contact-unknown-001",
    })

    client = auth_client
    r = await client.get("/api/telephony/calls")
    assert r.status_code == 200

    found = [c for c in r.json() if c.get("pbx_call_id") == "contact-unknown-001"]
    assert len(found) == 1
    assert found[0]["contact_name"] in (None, "")


async def test_get_calls_contact_name_from_lead(clean_db, auth_client):
    """Активный лид по номеру без пациента → contact_name = имя лида."""
    from datetime import datetime, timezone

    await clean_db.crm_leads.insert_one({
        "id": "lead-contact-001",
        "first_name": "Дмитрий",
        "last_name": "Орлов",
        "phone": "+79003334455",
        "source": "phone",
        "status": "new",
        "is_active": True,
    })

    await clean_db.telephony_calls.insert_one({
        "phone_number": "+79003334455",
        "normalized_phone": "9003334455",
        "direction": "inbound",
        "status": "missed",
        "duration": 0,
        "created_at": datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
        "pbx_call_id": "contact-lead-001",
    })

    client = auth_client
    r = await client.get("/api/telephony/calls")
    assert r.status_code == 200

    found = [c for c in r.json() if c.get("pbx_call_id") == "contact-lead-001"]
    assert len(found) == 1
    assert found[0]["contact_name"] == "Дмитрий Орлов"