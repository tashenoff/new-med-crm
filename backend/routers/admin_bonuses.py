"""Explicitly authorized bonus configuration and a monthly, read-only register."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from database import get_database
from routers.auth import get_current_active_user
from services.admin_bonus_service import AdminBonusService

router = APIRouter(prefix="/api/admin-bonuses", tags=["Administrator bonuses"])


class BonusSettingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    enabled: bool
    rate_type: Literal["fixed", "percentage"] | None = None
    rate_value: int | float | str | None = None
    expected_revision: str | None = None


@router.get("/settings")
async def get_setting(user=Depends(get_current_active_user), db=Depends(get_database)):
    return AdminBonusService.public_setting(await AdminBonusService(db).setting())


@router.put("/settings")
async def save_setting(body: BonusSettingUpdate, user=Depends(get_current_active_user), db=Depends(get_database)):
    return await AdminBonusService(db).save_setting(body, user.id)


@router.get("/context")
async def get_report_context(user=Depends(get_current_active_user)):
    from services.admin_bonus_period import report_context
    return report_context()


@router.get("")
async def report(month: str = Query(pattern=r"^[0-9]{4}-(0[1-9]|1[0-2])$"),
                 employee_id: str | None = Query(default=None, max_length=200),
                 offset: int = Query(default=0, ge=0), limit: int = Query(default=100, ge=1, le=200),
                 user=Depends(get_current_active_user), db=Depends(get_database)):
    if month.startswith(("0000-", "9999-")):
        raise HTTPException(422, "Unsupported month")
    return await AdminBonusService(db).report(month, employee_id, offset, limit)
