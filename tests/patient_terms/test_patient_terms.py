"""Isolated real-Mongo tests. Never load backend/tests/conftest or a real DB.

Run: python -m unittest discover -s tests/patient_terms -v
Requires the disposable Mongo process on 127.0.0.1:27163 (see docs).
"""
import asyncio
from copy import deepcopy
from datetime import datetime, timedelta
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
import uuid

os.environ["MONGO_URL"] = "mongodb://127.0.0.1:27163"
os.environ["DB_NAME"] = "consent_synthetic_unused"
os.environ["WAZZUP24_API_KEY"] = "synthetic-never-send"
os.environ["CONSENT_PUBLIC_BASE_URL"] = "http://127.0.0.1:18763"
os.environ["CONSENT_ALLOW_LOCALHOST"] = "1"
os.environ["CONSENT_ENABLED"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from motor.motor_asyncio import AsyncIOMotorClient
from routers import patient_terms as routes
from services.patient_consent import ConsentConfig, PatientConsentService, digest, redact_links
from services.notification_sender import NotificationSender, wazzup_service


class TermsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # The endpoint is deliberately fixed, with a UNIQUE synthetic DB per test.
        self.client = AsyncIOMotorClient("mongodb://127.0.0.1:27163", serverSelectionTimeoutMS=2000)
        await self.client.admin.command("ping")
        self.name = "consent_synthetic_" + uuid.uuid4().hex
        self.db = self.client[self.name]
        self.service = PatientConsentService(self.db)
        await self.db.patients.insert_many([
            {"id": "synthetic-p1", "full_name": "Synthetic One", "phone": "+70000000001"},
            {"id": "synthetic-p2", "full_name": "Synthetic Two", "phone": "+70000000002"},
            {"id": "other-clinic", "clinic_id": "other", "phone": "+70000000003"},
        ])
        self.user = SimpleNamespace(id="synthetic-admin", role="admin", doctor_id=None)
        self.app = FastAPI()
        self.app.include_router(routes.router, prefix="/api")
        self.app.middleware("http")(routes.protect_patient_terms)
        self.app.dependency_overrides[routes.get_database] = lambda: self.db
        self.app.dependency_overrides[routes.get_current_active_user] = lambda: self.user
        self.http = AsyncClient(transport=ASGITransport(app=self.app), base_url="http://test")
        self.sender_patch = patch.object(wazzup_service, "send_message", AsyncMock(return_value=SimpleNamespace(id="synthetic-provider-id")))
        self.send = self.sender_patch.start()
        self.network_patch = patch.object(wazzup_service, "_make_request", AsyncMock(side_effect=AssertionError("Real provider call forbidden")))
        self.network = self.network_patch.start()

    async def asyncTearDown(self):
        self.network.assert_not_awaited()
        self.network_patch.stop()
        self.sender_patch.stop()
        await self.http.aclose()
        assert self.name.startswith("consent_synthetic_")
        await self.client.drop_database(self.name)
        self.client.close()

    async def token(self, patient="synthetic-p1", service=None):
        return (await (service or self.service).issue(patient)).rsplit("#", 1)[1]

    async def test_unchecked_get_and_lookup_do_not_accept(self):
        token = await self.token()
        before = await self.db.patient_terms_acceptances.find_one({})
        for method, url in [("GET", "/api/public/patient-terms/accept"), ("GET", "/api/public/patient-terms/lookup")]:
            response = await self.http.request(method, url)
            self.assertEqual(response.status_code, 405)
            self.assertEqual(response.headers["cache-control"], "no-store")
        response = await self.http.post("/api/public/patient-terms/lookup", json={"token": token})
        self.assertEqual(response.json()["state"], "pending")
        self.assertNotIn("Synthetic One", response.text)
        self.assertNotIn("synthetic-p1", response.text)
        self.assertNotIn("+70000000001", response.text)
        for body in [{"token": token}, {"token": token, "acknowledged": False}, {"token": token, "acknowledged": "true"}]:
            response = await self.http.post("/api/public/patient-terms/accept", json=body)
            self.assertEqual(response.status_code, 422)
        self.assertEqual(before, await self.db.patient_terms_acceptances.find_one({}))

    async def test_invalid_expired_revoked_and_deleted_patient(self):
        for token in ["bad", "a" * 43]:
            with self.assertRaises(HTTPException) as caught:
                await self.service.accept(token)
            self.assertEqual(caught.exception.status_code, 404)
        expired = await self.token()
        await self.db.patient_terms_tokens.update_one({"_id": digest(expired)}, {"$set": {"expires_at": datetime.utcnow() - timedelta(seconds=1)}})
        with self.assertRaises(HTTPException) as caught:
            await self.service.accept(expired)
        self.assertEqual(caught.exception.detail, "expired_link")
        revoked = await self.token()
        await self.service.revoke_pending("synthetic-p1")
        with self.assertRaises(HTTPException) as caught:
            await self.service.accept(revoked)
        self.assertEqual(caught.exception.detail, "revoked_link")
        deleted = await self.token("synthetic-p2")
        await self.db.patients.delete_one({"id": "synthetic-p2"})
        with self.assertRaises(HTTPException):
            await self.service.accept(deleted)

    async def test_concurrent_repeated_acceptance_one_server_timestamp(self):
        tokens = await asyncio.gather(*(self.token() for _ in range(8)))
        results = await asyncio.gather(*(self.service.accept(t) for t in tokens * 3))
        times = {item["accepted_at"] for item in results}
        self.assertEqual(len(times), 1)
        self.assertIsInstance(next(iter(times)), datetime)
        self.assertEqual(await self.db.patient_terms_acceptances.count_documents({"accepted_at": {"$ne": None}}), 1)
        self.assertEqual((await self.service.status("synthetic-p2"))["accepted"], False)
        self.assertIsNone(await self.service.issue("synthetic-p1"))
        self.assertEqual((await self.service.lookup(tokens[0]))["state"], "accepted")

    async def test_revoke_race_never_accepts_after_revocation(self):
        token = await self.token()
        link, stale = await self.service.resolve(token)
        await self.service.revoke_pending("synthetic-p1")
        # Force the pre-revocation read to exercise the actual Mongo CAS.
        original = self.service.resolve
        first = True
        async def delayed(value):
            nonlocal first
            if first:
                first = False
                return link, stale
            return await original(value)
        with patch.object(self.service, "resolve", delayed):
            with self.assertRaises(HTTPException) as caught:
                await self.service.accept(token)
        self.assertEqual(caught.exception.detail, "revoked_link")
        self.assertFalse((await self.service.status("synthetic-p1"))["accepted"])

    async def test_expiry_is_checked_by_mongo_cas(self):
        token = await self.token()
        link, stale = await self.service.resolve(token)
        link["expires_at"] = datetime.utcnow() - timedelta(seconds=1)
        await self.db.patient_terms_tokens.update_one({"_id": digest(token)}, {"$set": {"expires_at": link["expires_at"]}})
        original = self.service.resolve
        calls = 0
        async def delayed(value):
            nonlocal calls
            calls += 1
            return (link, stale) if calls == 1 else await original(value)
        with patch.object(self.service, "resolve", delayed):
            with self.assertRaises(HTTPException) as caught:
                await self.service.accept(token)
        self.assertEqual(caught.exception.detail, "expired_link")

    async def test_versions_keep_original_text_and_independent_status(self):
        token = await self.token()
        await self.service.accept(token)
        config = ConsentConfig()
        config.document["version"] = "demo-synthetic-v2"
        config.document["text"] = "Synthetic second version"
        next_service = PatientConsentService(self.db, config)
        self.assertFalse((await next_service.status("synthetic-p1"))["accepted"])
        await next_service.accept(await self.token(service=next_service))
        history = (await next_service.status("synthetic-p1"))["history"]
        self.assertEqual(len(history), 2)
        self.assertIn(self.service.config.document["text"], [r["document"]["text"] for r in history])
        config.document["text"] = "Attempt to overwrite same published version"
        with self.assertRaises(RuntimeError):
            await next_service.document()

    async def test_token_storage_contains_only_hash_not_secret(self):
        token = await self.token()
        stored = await self.db.patient_terms_tokens.find_one({})
        self.assertEqual(stored["_id"], digest(token))
        self.assertNotIn(token, str(stored))
        self.assertNotIn(token, str(await self.db.patient_terms_acceptances.find_one({})))
        self.assertNotIn("synthetic-p1", token)

    async def test_actual_wazzup_transport_submits_secret_but_persists_redacted_history(self):
        from models.wazzup import SendMessageRequest
        from services.wazzup_service import WazzupService
        token = await self.token()
        text = "Synthetic booking " + self.service.config.base_url + "/consent/#" + token
        wire = AsyncMock(return_value={"messageId": "synthetic-message"})
        with patch.object(wazzup_service, "_make_request", wire), patch.object(wazzup_service, "_get_default_channel_id", AsyncMock(return_value="synthetic-channel")), patch("services.wazzup_service.get_database", return_value=self.db), patch("database.get_database", return_value=self.db):
            result = await WazzupService.send_message(wazzup_service, SendMessageRequest(phone="+70000000001", text=text), persisted_text=redact_links(text))
            # Also cover a forwarded link in nested provider metadata.
            await wazzup_service.save_message_to_db("forwarded", "synthetic-channel", "+70000000001", "text", text, "incoming", metadata={"quote": {"text": text}})
        self.assertIn(token, wire.call_args.args[2]["text"])
        self.assertNotIn(token, result.text)
        self.assertNotIn(token, str(await self.db.wazzup_messages.find({}).to_list(None)))
        self.assertNotIn(token, str(await self.db.wazzup_chats.find({}).to_list(None)))

    async def test_rights_clinic_and_legacy_patient(self):
        self.assertFalse((await self.service.status("synthetic-p1"))["accepted"])
        del self.app.dependency_overrides[routes.get_current_active_user]
        self.assertIn((await self.http.get("/api/patients/synthetic-p1/terms-status")).status_code, (401, 403))
        self.app.dependency_overrides[routes.get_current_active_user] = lambda: self.user
        for role in ["marketer", "patient", "unknown"]:
            self.user.role = role
            self.assertEqual((await self.http.get("/api/patients/synthetic-p1/terms-status")).status_code, 403)
        self.user.role = "doctor"
        self.user.doctor_id = "d1"
        self.assertEqual((await self.http.get("/api/patients/synthetic-p1/terms-status")).status_code, 403)
        await self.db.appointments.insert_one({"patient_id": "synthetic-p1", "doctor_id": "d1"})
        self.assertEqual((await self.http.get("/api/patients/synthetic-p1/terms-status")).status_code, 200)
        self.assertEqual((await self.http.post("/api/patients/synthetic-p1/terms/revoke-links")).status_code, 403)
        self.user.role = "admin"
        self.assertEqual((await self.http.get("/api/patients/other-clinic/terms-status")).status_code, 404)
        await self.db.users.insert_one({"id": self.user.id, "clinic_id": "other"})
        self.assertEqual((await self.http.get("/api/patients/synthetic-p1/terms-status")).status_code, 403)

    async def notification(self, event="synthetic-a1"):
        await self.db.appointments.update_one({"id": event}, {"$setOnInsert": {"patient_id": "synthetic-p1"}}, upsert=True)
        return await NotificationSender(self.db).send_appointment_created_notification(
            patient_phone="caller-must-not-control-recipient", patient_name="Synthetic One", doctor_name="Synthetic Doctor",
            appointment_date="2026-11-01", appointment_time="10:30", patient_id="synthetic-p1", appointment_id=event)

    async def rules(self):
        await self.db.notification_rules.insert_many([
            {"status": True, "recipient": "patient", "trigger": "appointment_created", "method": "wazzup", "message_template": "%name%: %date% %time%"},
            {"status": True, "recipient": "patient", "trigger": "appointment_created", "method": "wazzup", "message_template": "Duplicate rule"},
        ])

    async def test_one_message_same_body_date_time_link_concurrency_retry(self):
        await self.rules()
        results = await asyncio.gather(*(self.notification() for _ in range(12)))
        self.send.assert_awaited_once()
        message = self.send.call_args.args[0]
        self.assertEqual(message.phone, "+70000000001")
        self.assertIn("2026-11-01", message.text)
        self.assertIn("10:30", message.text)
        self.assertEqual(message.text.count("/consent/"), 1)
        self.assertNotIn("/consent/", self.send.call_args.kwargs["persisted_text"])
        self.assertEqual((await self.notification())["state"], "submitted")
        self.send.assert_awaited_once()
        self.assertTrue(any(r["state"] == "submitted" for r in results))

    async def test_accepted_patient_no_link_and_failure_does_not_duplicate_or_claim_delivery(self):
        await self.rules()
        await self.service.accept(await self.token())
        await self.notification()
        self.assertNotIn("/consent/", self.send.call_args.args[0].text)
        self.send.reset_mock()
        self.send.side_effect = TimeoutError("provider may have received message")
        self.assertEqual((await self.notification("synthetic-a2"))["state"], "unknown")
        self.assertEqual((await self.notification("synthetic-a2"))["state"], "unknown")
        self.send.assert_awaited_once()
        event = await self.db.appointment_notifications.find_one({"appointment_id": "synthetic-a2"})
        self.assertNotIn("delivered_at", event)
        self.assertNotIn("provider_message_id", event)

    async def test_preparation_error_safe_retry_and_no_active_rule(self):
        self.assertEqual((await self.notification())["state"], "disabled")
        await self.rules()
        with patch.object(PatientConsentService, "issue", AsyncMock(side_effect=RuntimeError("synthetic preparation error"))):
            self.assertEqual((await self.notification())["state"], "blocked")
        self.send.assert_not_awaited()
        self.assertEqual((await self.notification())["state"], "submitted")
        self.send.assert_awaited_once()

    async def test_disabled_keeps_original_created_message_and_no_consent_writes(self):
        await self.rules()
        with patch.dict(os.environ, {"CONSENT_ENABLED": "0"}):
            result = await self.notification()
            self.assertEqual(result, {"state": "submitted", "consent_link_state": "disabled"})
            self.assertFalse((await PatientConsentService(self.db).status("synthetic-p1"))["accepted"])
            with self.assertRaises(ValueError):
                await PatientConsentService(self.db).issue("synthetic-p1")
            readiness = await self.http.get("/api/patient-terms/readiness")
            self.assertEqual(readiness.status_code, 200)
            self.assertEqual(readiness.json()["reason"], "disabled")
            self.assertFalse(readiness.json()["consent_links"])
        self.send.assert_awaited_once()
        self.assertEqual(self.send.call_args.args[0].text, "Synthetic One: 2026-11-01 10:30")
        self.assertEqual(await self.db.patient_terms_tokens.count_documents({}), 0)
        self.assertEqual(await self.db.patient_terms_acceptances.count_documents({}), 0)

    async def test_missing_config_keeps_original_message_and_diagnoses_reason(self):
        await self.rules()
        with patch.dict(os.environ, {"CONSENT_PUBLIC_BASE_URL": ""}):
            result = await self.notification()
            self.assertEqual(result["consent_link_state"], "missing_public_url")
            response = await self.http.get("/api/patient-terms/readiness")
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["reason"], "missing_public_url")
            self.assertFalse((await PatientConsentService(self.db).status("synthetic-p1"))["accepted"])
        self.send.assert_awaited_once()
        self.assertEqual(self.send.call_args.args[0].text, "Synthetic One: 2026-11-01 10:30")
        self.assertEqual(await self.db.patient_terms_tokens.count_documents({}), 0)
        event = await self.db.appointment_notifications.find_one({})
        self.assertEqual(event["consent_link_state"], "missing_public_url")
        # Turning issuance on never replays the booking already submitted.
        await self.notification()
        self.send.assert_awaited_once()

    async def test_enabled_bad_url_reports_unready_and_never_sends_bad_link(self):
        await self.rules()
        with patch.dict(os.environ, {"CONSENT_PUBLIC_BASE_URL": "http://localhost:3000", "CONSENT_ALLOW_LOCALHOST": "0"}):
            result = await self.notification()
            response = await self.http.get("/api/patient-terms/readiness")
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["reason"], "invalid_public_url")
            self.assertNotIn("localhost", response.text)
            self.assertEqual(result["consent_link_state"], "invalid_public_url")
            self.assertFalse((await PatientConsentService(self.db).status("synthetic-p1"))["accepted"])
        self.send.assert_awaited_once()
        self.assertEqual(self.send.call_args.args[0].text, "Synthetic One: 2026-11-01 10:30")
        self.assertEqual(await self.db.patient_terms_tokens.count_documents({}), 0)

    async def test_readiness_is_admin_only_and_contains_no_secrets(self):
        response = await self.http.get("/api/patient-terms/readiness")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["consent_links"])
        self.assertNotIn("127.0.0.1", response.text)
        self.user.role = "doctor"
        self.assertEqual((await self.http.get("/api/patient-terms/readiness")).status_code, 403)

    async def test_calendar_creation_path_and_existing_overlap_retry(self):
        from models.appointment import AppointmentCreate
        from routers.appointments import create_appointment
        await self.rules()
        await self.db.doctors.insert_one({"id": "d1", "full_name": "Synthetic Doctor", "is_active": True})
        appointment = AppointmentCreate(patient_id="synthetic-p1", doctor_id="d1", complex_id="synthetic-bypass-schedule", appointment_date="2026-11-01", appointment_time="10:30", status="confirmed")
        result = await create_appointment(appointment, self.user, self.db)
        self.send.assert_awaited_once()
        event = await self.db.appointment_notifications.find_one({"appointment_id": result.id})
        self.assertEqual(event["state"], "submitted")
        with self.assertRaises(HTTPException):
            await create_appointment(appointment, self.user, self.db)
        self.send.assert_awaited_once()

    async def test_lead_scheduling_path_sends_once_and_overlap_retry_does_not_send(self):
        from crm.models.lead import Lead
        from crm.routes import leads
        await self.rules()
        lead = Lead(id="synthetic-lead", first_name="Synthetic", phone="+70000000001", source="phone", converted_to_client_id="synthetic-p1")
        lead_service = SimpleNamespace(get_lead_by_id=AsyncMock(return_value=lead), update_lead_status=AsyncMock())
        body = {"appointment_date": "2026-11-02", "appointment_time": "11:00", "end_time": "11:30", "doctor_id": "d1"}
        with patch.object(leads, "LeadService", return_value=lead_service):
            result = await leads.schedule_appointment_from_lead("synthetic-lead", body, self.db)
            self.assertEqual(result["patient_id"], "synthetic-p1")
            self.send.assert_awaited_once()
            with self.assertRaises(HTTPException):
                await leads.schedule_appointment_from_lead("synthetic-lead", body, self.db)
            self.send.assert_awaited_once()

    async def test_both_legacy_conversion_paths_use_same_notification_event(self):
        from crm.models.lead import Lead
        from crm.models.client import Client
        from crm.services.integration_service import IntegrationService
        from services.notification_sender import notify_created_appointment
        await self.rules()
        service = IntegrationService(self.db)
        lead = Lead(id="synthetic-convert", first_name="Synthetic", phone="+70000000001", source="phone")
        service.lead_service.get_lead_by_id = AsyncMock(return_value=lead)
        service.lead_service.convert_to_client = AsyncMock()
        service.client_service.create_client = AsyncMock(return_value=SimpleNamespace(id="synthetic-crm-client"))
        service.client_service.link_to_hms_patient = AsyncMock()
        result = await service.convert_lead_to_patient("synthetic-convert", True, True, {
            "doctor_id": "d1", "appointment_date": "2026-11-03", "appointment_time": "12:00"})
        self.send.assert_awaited_once()
        appointment = await self.db.appointments.find_one({"id": result["appointment_id"]})
        await notify_created_appointment(self.db, appointment)
        self.send.assert_awaited_once()
        self.send.reset_mock()
        client = Client(id="synthetic-crm-client-two", first_name="Synthetic", last_name="Client", phone="+70000000002")
        service.client_service.get_client_by_id = AsyncMock(return_value=client)
        result = await service.convert_client_to_hms_patient(client.id, True, {
            "doctor_id": "d1", "appointment_date": "2026-11-04", "appointment_time": "13:00"})
        self.send.assert_awaited_once()
        self.assertIn("/consent/#", self.send.call_args.args[0].text)
        appointment = await self.db.appointments.find_one({"id": result["appointment_id"]})
        await notify_created_appointment(self.db, appointment)
        self.send.assert_awaited_once()


class ConfigTests(unittest.TestCase):
    def test_production_origin_validation(self):
        for origin in ["http://curai.asia", "https://user:password@curai.asia", "https://curai.asia/path", "https://curai.asia?x=y", "https://curai.asia#x", "https://localhost", "https://127.0.0.1", "https://192.168.1.1", "https://curai.asia:bad"]:
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                ConsentConfig.validate_url(origin)
        self.assertEqual(ConsentConfig({"CONSENT_PUBLIC_BASE_URL": "https://curai.asia"}).base_url, "https://curai.asia")
        self.assertEqual(ConsentConfig({"CONSENT_PUBLIC_BASE_URL": "http://localhost:18763", "CONSENT_ALLOW_LOCALHOST": "1"}).ttl_hours, 168)

    def test_feature_defaults_off_and_invalid_config_has_explicit_readiness(self):
        self.assertEqual(ConsentConfig({}).readiness()["reason"], "disabled")
        self.assertFalse(ConsentConfig({"CONSENT_PUBLIC_BASE_URL": "https://curai.asia"}).readiness()["consent_links"])
        for settings, reason in [({"CONSENT_ENABLED": "1"}, "missing_public_url"),
            ({"CONSENT_ENABLED": "1", "CONSENT_PUBLIC_BASE_URL": "http://curai.asia"}, "invalid_public_url"),
            ({"CONSENT_ENABLED": "maybe"}, "invalid_enabled_flag"),
            ({"CONSENT_ENABLED": "1", "CONSENT_TOKEN_TTL_HOURS": "bad"}, "invalid_token_ttl")]:
            with self.subTest(reason=reason):
                result = ConsentConfig(settings).readiness()
                self.assertFalse(result["ready"])
                self.assertFalse(result["consent_links"])
                self.assertEqual(result["reason"], reason)

    def test_forwarded_link_and_metadata_redaction(self):
        secret = "a" * 43
        value = {"text": "https://curai.asia/consent/" + secret, "metadata": [{"quote": "/consent/" + secret}]}
        self.assertNotIn(secret, str(redact_links(value)))
        self.assertIn(secret, str(value))
