"""Local-only browser fixture: actual consent API + real built UI, synthetic rest.

No production server import, real credentials, outgoing provider or real DB.
Run from repository: python tests/patient_terms/browser_fixture.py
"""
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import uuid

os.environ["CONSENT_PUBLIC_BASE_URL"] = "http://127.0.0.1:18763"
os.environ["CONSENT_ALLOW_LOCALHOST"] = "1"
os.environ["MONGO_URL"] = "mongodb://127.0.0.1:27163"
os.environ["DB_NAME"] = "consent_synthetic_unused"
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient
import uvicorn
from routers import patient_terms as routes
from services.patient_consent import PatientConsentService, digest

DIST = ROOT.parent / "medcrm-consent-frontend" / "frontend" / "dist"
client = AsyncIOMotorClient("mongodb://127.0.0.1:27163", serverSelectionTimeoutMS=2000)
name = "consent_synthetic_browser_" + uuid.uuid4().hex
db = client[name]
patients = [{"id": "synthetic-browser-one", "full_name": "Тестовый пациент Один", "phone": "+70000000001", "source": "other"},
            {"id": "synthetic-browser-two", "full_name": "Тестовый пациент Два", "phone": "+70000000002", "source": "other"}]
user = {"id": "synthetic-admin", "full_name": "Локальный тест", "role": "super_admin", "permissions": [], "is_active": True}
links = {}


@asynccontextmanager
async def lifespan(app):
    await client.admin.command("ping")
    await db.patients.insert_many([dict(p) for p in patients])
    service = PatientConsentService(db)
    links["pending"] = await service.issue(patients[0]["id"])
    links["expired"] = await service.issue(patients[1]["id"])
    expired = links["expired"].split("#")[1]
    await db.patient_terms_tokens.update_one({"_id": digest(expired)}, {"$set": {"expires_at": datetime.utcnow() - timedelta(hours=1)}})
    links["revoked"] = await service.issue(patients[1]["id"])
    await service.revoke_pending(patients[1]["id"])
    # Separate expired link in the new epoch so each error can be observed.
    links["expired"] = await service.issue(patients[1]["id"])
    await db.patient_terms_tokens.update_one({"_id": digest(links["expired"].split("#")[1])}, {"$set": {"expires_at": datetime.utcnow() - timedelta(hours=1)}})
    print("Synthetic browser fixture ready at http://127.0.0.1:18763 (no tokens logged)")
    try:
        yield
    finally:
        assert name.startswith("consent_synthetic_browser_")
        await client.drop_database(name)
        client.close()


app = FastAPI(lifespan=lifespan)
app.include_router(routes.router, prefix="/api")
app.dependency_overrides[routes.get_database] = lambda: db
app.dependency_overrides[routes.get_current_active_user] = lambda: SimpleNamespace(**user, doctor_id=None)
app.middleware("http")(routes.protect_patient_terms)


@app.middleware("http")
async def static_privacy(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/consent/"):
        config = json.loads((DIST.parent / "vercel.json").read_text())
        for header in config["headers"][0]["headers"]:
            response.headers[header["key"]] = header["value"]
    return response


@app.get("/__fixture/links")
async def fixture_links():
    return links


@app.get("/api/{path:path}")
async def synthetic_api(path: str, request: Request):
    if path == "auth/me":
        return user
    if path == "patients":
        return patients
    if path.startswith("patients/") and len(path.split("/")) == 2:
        return next((p for p in patients if p["id"] == path.split("/")[1]), {})
    if path == "wazzup/chats":
        return {"chats": [{"phone": p["phone"], "patient_id": p["id"], "patient_name": p["full_name"], "source": "patient", "unread_count": 0} for p in patients], "total": 2}
    if path.startswith("wazzup/messages/history"):
        return {"messages": [], "total_count": 0}
    if path == "crm/whatsapp/kanban-stage":
        return {"columns": [], "current_label": "Этап сделки", "can_move": False}
    if path == "wazzup/connection":
        return {"connected": False, "status": "offline"}
    if path.endswith("stats") or path.endswith("statistics"):
        return {}
    return []


@app.get("/{path:path}")
async def static(path: str):
    candidate = (DIST / path).resolve()
    if candidate.is_relative_to(DIST.resolve()) and candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(DIST / "index.html")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=18763, access_log=False)
