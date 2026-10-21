"""Bearer-link acknowledgement; never identity verification or medical consent.

The acceptance CAS and revocation epoch live in one Mongo document. Tokens are
separate. This works on standalone MongoDB without a cross-collection transaction.
"""
import ipaddress
import hashlib
import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from bson import ObjectId
from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError


DEMO_DOCUMENT = {
    "version": "demo-2026-10-21-v1",
    "title": "Условия для пациента — демонстрационный пример",
    "text": "ДЕМОНСТРАЦИОННЫЙ ТЕКСТ. Это пример для проверки интерфейса, "
            "а не утверждённая политика клиники.\n\n"
            "Перед посещением уточните время и порядок приёма у клиники. "
            "Если планы изменились, сообщите об этом клинике.\n\n"
            "Нажимая кнопку, обладатель этой ссылки подтверждает ознакомление "
            "именно с этой версией текста. Ссылка не подтверждает личность, "
            "не даёт доступа к CRM и не заменяет медицинские согласия. "
            "Юридическая достаточность этого примера не оценивалась.",
    "demonstration": True,
}


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def redact_links(value):
    """Also sanitize forwarded links and nested provider webhook metadata."""
    if isinstance(value, str):
        return re.sub(r"/consent/(?:#)?[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])", "/consent/[hidden]", value)
    if isinstance(value, dict):
        return {k: redact_links(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_links(v) for v in value]
    return value


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value else None


def patient_query(patient_id):
    choices = [{"id": patient_id}, {"_id": patient_id}]
    if ObjectId.is_valid(patient_id):
        choices.append({"_id": ObjectId(patient_id)})
    return {"$or": choices}


class ConsentConfig:
    def __init__(self, env=None):
        env = os.environ if env is None else env
        self.clinic = env.get("CONSENT_CLINIC_ID", "clinic")
        self.document = dict(DEMO_DOCUMENT)
        flag = env.get("CONSENT_ENABLED", "0").lower()
        self.enabled = flag in ("1", "true")
        self.errors = []
        if flag not in ("0", "false", "1", "true"):
            self.errors.append("invalid_enabled_flag")
        try:
            self.ttl_hours = int(env.get("CONSENT_TOKEN_TTL_HOURS", "168"))
            if not 1 <= self.ttl_hours <= 2160:
                raise ValueError()
        except ValueError:
            self.ttl_hours = 168
            self.errors.append("invalid_token_ttl")
        self.base_url = env.get("CONSENT_PUBLIC_BASE_URL", "").rstrip("/")
        if self.enabled and self.base_url:
            try:
                self.validate_url(self.base_url, env.get("CONSENT_ALLOW_LOCALHOST") == "1")
            except ValueError:
                self.errors.append("invalid_public_url")

    def readiness(self):
        # Outbound configuration never prevents reading existing status/history.
        reason = (self.errors[0] if self.errors else "disabled" if not self.enabled
                  else "missing_public_url" if not self.base_url else "ready")
        return {"enabled": self.enabled, "ready": reason in ("disabled", "ready"),
                "consent_links": reason == "ready", "reason": reason,
                "token_ttl_hours": self.ttl_hours}

    @staticmethod
    def validate_url(value, allow_local=False):
        url = urlsplit(value)
        local = allow_local and url.hostname in ("localhost", "127.0.0.1", "::1")
        if (url.scheme != "https" and not (local and url.scheme == "http")) or (
            not url.hostname or url.username or url.password or url.query or url.fragment
            or url.path not in ("", "/") or "\\" in value or any(c.isspace() for c in value)
        ):
            raise ValueError("CONSENT_PUBLIC_BASE_URL must be a trusted HTTPS origin")
        if url.hostname in ("localhost", "127.0.0.1", "::1") and not local:
            raise ValueError("Localhost requires CONSENT_ALLOW_LOCALHOST=1")
        try:
            address = ipaddress.ip_address(url.hostname)
        except ValueError:
            if not local and not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", url.hostname):
                raise ValueError("Invalid public hostname")
            if not local and "." not in url.hostname:
                raise ValueError("Public hostname required")
        else:
            if not address.is_global and not local:
                raise ValueError("Public origin required")
        # Reject malformed ports, including otherwise valid-looking HTTPS URLs.
        _ = url.port


class PatientConsentService:
    def __init__(self, db, config=None):
        self.db = db
        self.config = config or ConsentConfig()

    async def patient(self, patient_id):
        patient = await self.db.patients.find_one(patient_query(patient_id))
        if not patient or patient.get("clinic_id", self.config.clinic) != self.config.clinic:
            raise HTTPException(404, "Patient not found")
        return patient

    def record_id(self, patient_id, version):
        return digest(json.dumps([self.config.clinic, patient_id, version]))

    async def document(self):
        doc = dict(self.config.document)
        doc["text_sha256"] = digest(doc["text"])
        key = self.config.clinic + ":" + doc["version"]
        try:
            await self.db.patient_terms_documents.update_one(
                {"_id": key}, {"$setOnInsert": doc}, upsert=True)
        except DuplicateKeyError:
            pass
        stored = await self.db.patient_terms_documents.find_one({"_id": key})
        if any(stored.get(k) != v for k, v in doc.items()):
            raise RuntimeError("Published terms version is immutable; assign a new version")
        return {k: stored[k] for k in doc}

    async def issue(self, patient_id):
        readiness = self.config.readiness()
        if not readiness["consent_links"]:
            raise ValueError("Consent link generation unavailable: " + readiness["reason"])
        patient = await self.patient(patient_id)
        patient_id = str(patient.get("id") or patient["_id"])
        document = await self.document()
        key = self.record_id(patient_id, document["version"])
        try:
            await self.db.patient_terms_acceptances.update_one({"_id": key}, {"$setOnInsert": {
                "clinic_id": self.config.clinic, "patient_id": patient_id,
                "document": document, "epoch": 0, "accepted_at": None,
            }}, upsert=True)
        except DuplicateKeyError:
            pass
        record = await self.db.patient_terms_acceptances.find_one({"_id": key})
        if record.get("accepted_at"):
            return None
        token = secrets.token_urlsafe(32)
        await self.db.patient_terms_tokens.insert_one({
            "_id": digest(token), "acceptance_id": key, "clinic_id": self.config.clinic,
            "epoch": record["epoch"], "expires_at": datetime.utcnow() + timedelta(hours=self.config.ttl_hours),
            "created_at": datetime.utcnow(),
        })
        return self.config.base_url + "/consent/#" + token

    async def resolve(self, token):
        if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
            raise HTTPException(404, "invalid_link")
        link = await self.db.patient_terms_tokens.find_one({"_id": digest(token), "clinic_id": self.config.clinic})
        if not link:
            raise HTTPException(404, "invalid_link")
        record = await self.db.patient_terms_acceptances.find_one({"_id": link["acceptance_id"], "clinic_id": self.config.clinic})
        if not record or record["epoch"] != link["epoch"]:
            raise HTTPException(410, "revoked_link")
        # A deleted/moved patient must not be accepted through an old link.
        await self.patient(record["patient_id"])
        if not record.get("accepted_at") and link["expires_at"] <= datetime.utcnow():
            raise HTTPException(410, "expired_link")
        return link, record

    @staticmethod
    def public(record):
        return {"document": record["document"], "accepted_at": utc(record.get("accepted_at")),
                "state": "accepted" if record.get("accepted_at") else "pending"}

    async def lookup(self, token):
        _, record = await self.resolve(token)
        return self.public(record)

    async def accept(self, token):
        link, record = await self.resolve(token)
        if not record.get("accepted_at"):
            # Mongo server time both enforces expiry and records the event. Revocation
            # increments epoch on this SAME row, so it cannot race past acceptance.
            updated = await self.db.patient_terms_acceptances.find_one_and_update({
                "_id": record["_id"], "epoch": link["epoch"], "accepted_at": None,
                "$expr": {"$lt": ["$$NOW", link["expires_at"]]},
            }, [{"$set": {"accepted_at": "$$NOW", "confirmation": "link_holder"}}],
                return_document=ReturnDocument.AFTER)
            if updated:
                record = updated
            else:
                _, record = await self.resolve(token)
                if not record.get("accepted_at"):
                    raise HTTPException(409, "retry_confirmation")
        return self.public(record)

    async def revoke_pending(self, patient_id):
        patient = await self.patient(patient_id)
        patient_id = str(patient.get("id") or patient["_id"])
        await self.db.patient_terms_acceptances.update_many({
            "clinic_id": self.config.clinic, "patient_id": patient_id, "accepted_at": None,
        }, {"$inc": {"epoch": 1}})

    async def status(self, patient_id):
        patient = await self.patient(patient_id)
        patient_id = str(patient.get("id") or patient["_id"])
        rows = await self.db.patient_terms_acceptances.find({
            "clinic_id": self.config.clinic, "patient_id": patient_id,
            "accepted_at": {"$ne": None},
        }).sort("accepted_at", -1).to_list(None)
        version = self.config.document["version"]
        current = next((r for r in rows if r["document"]["version"] == version), None)
        return {"accepted": bool(current), "accepted_at": utc(current["accepted_at"]) if current else None,
                "version": version, "demonstration": self.config.document["demonstration"],
                "history": [{"accepted_at": utc(r["accepted_at"]), "document": r["document"]} for r in rows]}
