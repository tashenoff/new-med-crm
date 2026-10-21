from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, StrictBool, Field

from database import get_database
from dependencies import get_current_active_user
from services.patient_consent import PatientConsentService

router = APIRouter()


async def protect_patient_terms(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/public/patient-terms") or request.url.path.endswith("/terms-status"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response


class LinkRequest(BaseModel):
    token: str = Field(min_length=1, max_length=256, repr=False)


class AcceptRequest(LinkRequest):
    acknowledged: StrictBool


@router.post("/public/patient-terms/lookup")
async def lookup(body: LinkRequest, db=Depends(get_database)):
    # Read-only POST keeps the bearer out of API URLs/access logs.
    return await PatientConsentService(db).lookup(body.token)


@router.post("/public/patient-terms/accept")
async def accept(body: AcceptRequest, db=Depends(get_database)):
    if body.acknowledged is not True:
        raise HTTPException(422, "explicit_confirmation_required")
    return await PatientConsentService(db).accept(body.token)


async def authorize_patient(patient_id, user, db):
    service = PatientConsentService(db)
    patient = await service.patient(patient_id)
    # This application uses one clinic database. Reject explicit mismatches even
    # where the legacy Pydantic auth model discards the clinic_id field.
    raw_user = await db.users.find_one({"id": user.id})
    if raw_user and raw_user.get("clinic_id", service.config.clinic) != service.config.clinic:
        raise HTTPException(403, "Clinic access denied")
    role = getattr(user.role, "value", user.role)
    if role not in ("admin", "super_admin", "administrator", "doctor"):
        raise HTTPException(403, "Patient terms access denied")
    if role == "doctor":
        canonical = str(patient.get("id") or patient["_id"])
        if not user.doctor_id or not await db.appointments.find_one({
            "patient_id": canonical, "doctor_id": user.doctor_id,
        }):
            raise HTTPException(403, "Patient terms access denied")
    return service


@router.get("/patients/{patient_id}/terms-status")
async def terms_status(patient_id: str, user=Depends(get_current_active_user), db=Depends(get_database)):
    service = await authorize_patient(patient_id, user, db)
    return await service.status(patient_id)


@router.post("/patients/{patient_id}/terms/revoke-links")
async def revoke(patient_id: str, user=Depends(get_current_active_user), db=Depends(get_database)):
    service = await authorize_patient(patient_id, user, db)
    if getattr(user.role, "value", user.role) not in ("admin", "super_admin", "administrator"):
        raise HTTPException(403, "Administrator required")
    await service.revoke_pending(patient_id)
    return {"revoked": True}
