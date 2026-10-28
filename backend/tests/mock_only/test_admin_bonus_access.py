"""Real JWT/server guards with synthetic storage; no account grant mutations."""
from unittest.mock import AsyncMock

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI

import database
from api_permissions import install_api_permissions
from permission_staging_app import MemoryDB, account
from routers import auth, admin_bonuses
from services.admin_bonus_service import AdminBonusService


@pytest_asyncio.fixture
async def client(monkeypatch):
    monkeypatch.setenv("ADMIN_BONUS_TIMEZONE", "Asia/Almaty")
    db = MemoryDB()
    for identity, role, permissions in (
        ("owner", "super_admin", []), ("ordinary-admin", "admin", []),
        ("ordinary-doctor", "doctor", []),
        ("viewer", "doctor", ["admin_bonus_view", "patients_view"]),
        ("manager", "admin", ["admin_bonus_manage"]),
        ("incomplete-viewer", "admin", ["admin_bonus_view"]),
    ):
        account(db, identity, role, permissions=permissions, mode="explicit")
    report = AsyncMock(return_value=dict(month="2026-10", timezone="Asia/Almaty", rows=[], employees=[], total=0))
    monkeypatch.setattr(AdminBonusService, "report", report)
    app = FastAPI()
    app.include_router(admin_bonuses.router)
    install_api_permissions(app)
    for dependency in (database.get_database, auth.get_database, admin_bonuses.get_database):
        app.dependency_overrides[dependency] = lambda: db
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://synthetic") as session:
        yield session, db, report


def headers(identity, **claims):
    token = auth.create_access_token(dict(sub=identity, sub_type="user_id", **claims))
    return {"Authorization": "Bearer " + token}


async def test_server_super_admin_without_scopes_reads_and_manages_bonuses(client):
    session, db, report = client
    owner = headers("owner")
    assert (await session.get("/api/admin-bonuses/settings", headers=owner)).status_code == 200
    assert (await session.get("/api/admin-bonuses/context", headers=owner)).status_code == 200
    result = await session.get("/api/admin-bonuses?month=2026-10", headers=owner)
    assert result.status_code == 200 and result.json()["timezone"] == "Asia/Almaty"
    saved = await session.put("/api/admin-bonuses/settings", headers=owner,
        json=dict(enabled=True, rate_type="percentage", rate_value=10))
    assert saved.status_code == 200 and saved.json()["updated_by"] == "owner"
    assert db.users.rows[0]["custom_permissions"] == []
    assert db.staff.rows[0]["custom_permissions"] == []
    report.assert_awaited_once()


@pytest.mark.parametrize("identity", ["ordinary-admin", "ordinary-doctor"])
async def test_server_ordinary_roles_without_scopes_cannot_claim_super_admin(client, identity):
    session, _, _ = client
    # The authenticated role is read from storage, not a JWT role claim or input.
    actor = headers(identity, role="super_admin")
    for path in ("/api/admin-bonuses/settings", "/api/admin-bonuses/context", "/api/admin-bonuses?month=2026-10&role=super_admin"):
        assert (await session.get(path, headers=actor)).status_code == 403
    assert (await session.put("/api/admin-bonuses/settings", headers=actor, json=dict(enabled=False))).status_code == 403


async def test_server_explicit_grants_keep_view_and_manage_separate(client):
    session, _, _ = client
    viewer = headers("viewer")
    assert (await session.get("/api/admin-bonuses?month=2026-10", headers=viewer)).status_code == 200
    assert (await session.put("/api/admin-bonuses/settings", headers=viewer, json=dict(enabled=False))).status_code == 403
    manager = headers("manager")
    assert (await session.get("/api/admin-bonuses/settings", headers=manager)).status_code == 200
    assert (await session.put("/api/admin-bonuses/settings", headers=manager, json=dict(enabled=False))).status_code == 200
    assert (await session.get("/api/admin-bonuses?month=2026-10", headers=manager)).status_code == 403
    assert (await session.get("/api/admin-bonuses?month=2026-10", headers=headers("incomplete-viewer"))).status_code == 403


async def test_inactive_super_admin_is_rejected_by_real_authentication(client):
    session, db, _ = client
    db.staff.rows[0]["is_active"] = False
    assert (await session.get("/api/admin-bonuses/settings", headers=headers("owner"))).status_code == 401
