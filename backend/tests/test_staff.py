"""Staff API regression checks (this worktree had no test_staff.py)."""

import uuid

import httpx
from fastapi import FastAPI

from routers import staff


async def test_staff_api_preserves_extension(clean_db):
    app = FastAPI()
    app.include_router(staff.router)
    app.dependency_overrides[staff.get_database] = lambda: clean_db
    app.dependency_overrides[staff.require_staff_permission] = lambda: object()
    member_id = None
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post("/api/staff/", json={
                "login": f"calliq-{uuid.uuid4()}", "password": "test-password",
                "full_name": "Operator Name", "role": "administrator", "extension": "100"})
            assert created.status_code == 201
            member_id = created.json()["id"]
            assert created.json()["extension"] == "100"
            updated = await client.put(f"/api/staff/{member_id}", json={"extension": "101"})
            assert updated.status_code == 200
            assert updated.json()["extension"] == "101"
            fetched = await client.get(f"/api/staff/{member_id}")
            assert fetched.json()["extension"] == "101"
    finally:
        if member_id:
            await clean_db.staff.delete_one({"_id": member_id})
            await clean_db.users.delete_one({"_id": member_id})
