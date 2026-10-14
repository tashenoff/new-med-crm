import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock
from datetime import datetime
from bson import ObjectId
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
# Never import the production module that constructs Mongo clients.
database = ModuleType("database")
database.get_database = lambda: None
database.db = None
sys.modules["database"] = database
services = ModuleType("services")
services.__path__ = [str(Path(__file__).resolve().parents[1] / "backend" / "services")]
sys.modules["services"] = services
from routers import auth, staff
from models.auth import UserCreate, UserLogin
from models.staff import StaffMemberUpdate
from services.staff_service import StaffService


def matches(doc, query):
    return all((any(matches(doc, q) for q in value) if key == "$or" else
                doc.get(key) != value["$ne"] if isinstance(value, dict) and "$ne" in value else
                doc.get(key) == value) for key, value in query.items())

class Collection:
    def __init__(self, docs=()):
        self.docs = [dict(d) for d in docs]
        self.writes = []
    async def find_one(self, query):
        return next((dict(d) for d in self.docs if matches(d, query)), None)
    async def insert_one(self, doc):
        self.writes.append(("insert", doc)); self.docs.append(dict(doc))
    async def update_one(self, query, update):
        self.writes.append((query, update))
        for d in self.docs:
            if matches(d, query):
                d.update(update["$set"])
                return SimpleNamespace(modified_count=1, matched_count=1)
        return SimpleNamespace(modified_count=0, matched_count=0)

def user(**fields):
    return dict(_id=ObjectId("507f1f77bcf86cd799439011"), id="public-id", created_at=datetime(2026, 1, 1), updated_at=datetime(2026, 1, 1), email="old@example.com", login="oldlogin",
                full_name="Staff", role="admin", hashed_password="hash", is_active=True, **fields)

def db(users=(), staff_docs=()):
    return SimpleNamespace(users=Collection(users), staff=Collection(staff_docs), doctors=Collection())

def client(database):
    app = FastAPI(); app.include_router(auth.auth_router); app.include_router(staff.router)
    app.dependency_overrides[auth.get_database] = lambda: database
    app.dependency_overrides[staff.get_staff_service] = lambda: StaffService(database)
    return TestClient(app)

def token(subject, **extra):
    return auth.create_access_token({"sub": subject, **extra})

@pytest.mark.parametrize("role", ["admin", "super_admin", "doctor", "patient"])
def test_public_signup_is_patient(role, monkeypatch):
    database = db(); monkeypatch.setattr(auth, "get_password_hash", lambda _: "hash")
    response = client(database).post("/auth/register", json=dict(login="new", password="secret", full_name="New", role=role))
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "patient"
    assert database.users.docs[0]["role"] == "patient"
    payload = jwt.decode(response.json()["access_token"], auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
    assert payload["sub"] == response.json()["user"]["id"]
    assert payload["sub_type"] == "user_id"

@pytest.mark.parametrize("subject,extra", [("old@example.com", {}), ("oldlogin", {}), ("public-id", {"sub_type":"user_id"})])
def test_token_resolution_preserves_public_id(subject, extra):
    response = client(db([user()])).get("/api/staff/roles/permissions/admin", headers={"Authorization":"Bearer " + token(subject, **extra)})
    assert response.status_code == 200

@pytest.mark.asyncio
async def test_login_token_stable_across_rename(monkeypatch):
    database = db([user()]); monkeypatch.setattr(auth, "verify_password", lambda *_: True)
    result = await auth.login(UserLogin(email="oldlogin", password="secret"), database)
    payload = jwt.decode(result["access_token"], auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
    assert payload["sub"] == "public-id"
    database.users.docs[0].update(email="new@example.com", login="newlogin")
    resolved = await auth.get_current_user(SimpleNamespace(credentials=result["access_token"]), database)
    assert resolved.id == "public-id"

@pytest.mark.parametrize("method,path,body", [
    ("GET", "/api/staff/", None), ("GET", "/api/staff/public-id", None),
    ("POST", "/api/staff/", dict(login="x",password="secret",full_name="X",role="admin")),
    ("PUT", "/api/staff/public-id", {"login":"x"}), ("DELETE", "/api/staff/other", None),
    ("GET", "/api/staff/public-id/permissions", None),
    ("POST", "/api/staff/public-id/check-permission?permission=patients_view", None),
    ("GET", "/api/staff/roles/permissions/admin", None),
    ("GET", "/api/staff/personnel/all", None),
    ("POST", "/api/staff/doctors/d/assign-access", {"email":"d@example.com","password":"secret"}),
    ("POST", "/api/staff/public-id/reset-password", {"new_password":"secret"}),
    ("DELETE", "/api/staff/doctors/d/revoke-access", None),
])
def test_inactive_old_admin_token_rejected(method, path, body):
    record = user(); record["is_active"] = False
    response = client(db([record])).request(method, path, json=body, headers={"Authorization":"Bearer " + token("old@example.com")})
    assert response.status_code in (400, 401, 403)
    assert response.json()["detail"] == "Inactive user"

@pytest.mark.asyncio
@pytest.mark.parametrize("field,value", [("email","taken@example.com"), ("login","taken")])
@pytest.mark.parametrize("legacy", [False, True])
async def test_collision_rejected_before_writes(field, value, legacy):
    own = user(); other = user(); other.update(_id="other", id="other", **{field:value})
    database = db([own, other], [] if legacy else [dict(_id="public-id", full_name="Staff", role="admin")])
    with pytest.raises(ValueError):
        await StaffService(database).update_staff_member("public-id", StaffMemberUpdate(**{field:value}))
    assert database.staff.writes == database.users.writes == []

@pytest.mark.asyncio
async def test_same_account_identity_update_allowed():
    database = db([user()])
    result = await StaffService(database).update_staff_member("public-id", StaffMemberUpdate(email="old@example.com", login="oldlogin"))
    assert result.id == "public-id"

@pytest.mark.asyncio
async def test_legacy_delete_deactivates_account():
    database = db([user()])
    assert await StaffService(database).delete_staff_member("public-id")
    assert database.users.docs[0]["is_active"] is False


def test_doctor_grant_body_and_login():
    database = db([user()]); service = SimpleNamespace(assign_access_to_doctor=AsyncMock(return_value={}))
    app = FastAPI(); app.include_router(staff.router)
    app.dependency_overrides[auth.get_database] = lambda: database
    app.dependency_overrides[staff.get_staff_service] = lambda: service
    c = TestClient(app); headers = {"Authorization":"Bearer " + token("old@example.com")}
    response = c.post("/api/staff/doctors/d/assign-access", json={"email":"d@example.com","password":"secret","login":"doc"}, headers=headers)
    assert response.status_code == 200
    service.assign_access_to_doctor.assert_awaited_once_with("d", "d@example.com", "secret", "doc")
    assert c.post("/api/staff/doctors/d/assign-access?email=d@example.com&password=secret", headers=headers).status_code == 422

@pytest.mark.parametrize("field,value", [("email", "taken@example.com"), ("login", "taken")])
def test_update_route_collision_is_client_error(field, value):
    other = user(); other.update(_id="other", id="other", **{field:value})
    database = db([user(), other])
    response = client(database).put("/api/staff/public-id", json={field:value},
        headers={"Authorization":"Bearer " + token("oldlogin")})
    assert response.status_code == 400
    assert database.users.writes == database.staff.writes == []

@pytest.mark.asyncio
@pytest.mark.parametrize("subject", ["old@example.com", "oldlogin"])
async def test_legacy_resolution_returns_public_id(subject):
    resolved = await auth.get_current_user(SimpleNamespace(credentials=token(subject)), db([user()]))
    assert resolved.id == "public-id"

@pytest.mark.parametrize("role,status", [("admin",200),("super_admin",200),("doctor",403),("marketer",403),("patient",403)])
def test_staff_role_policy_unchanged(role, status):
    record = user(); record["role"] = role
    service = SimpleNamespace(get_all_staff=AsyncMock(return_value=[]))
    app = FastAPI(); app.include_router(staff.router)
    app.dependency_overrides[auth.get_database] = lambda: db([record])
    app.dependency_overrides[staff.get_staff_service] = lambda: service
    response = TestClient(app).get("/api/staff/", headers={"Authorization":"Bearer " + token("oldlogin")})
    assert response.status_code == status

def test_id_token_does_not_fall_back_to_reassigned_login():
    record = user(); record.update(id="different", login="public-id")
    response = client(db([record])).get("/api/staff/roles/permissions/admin",
        headers={"Authorization":"Bearer " + token("public-id", sub_type="user_id")})
    assert response.status_code == 401


@pytest.mark.parametrize("email", [None, ""])
@pytest.mark.parametrize("existing", [False, True])
def test_doctor_login_only_grant(email, existing, monkeypatch):
    doctor_user = dict(_id="d", email=None, login="previous")
    database = db([user(), dict(_id="unrelated", email=None)], [])
    database.doctors.docs.append(dict(id="d", is_active=True, full_name="Doctor", email="contact@example.com"))
    if existing:
        database.users.docs.append(doctor_user)
        database.staff.docs.append(dict(_id="d", email=None))
    queries = []
    original_find = database.users.find_one
    async def find_one(query):
        queries.append(query)
        return await original_find(query)
    database.users.find_one = find_one
    monkeypatch.setattr(StaffService, "_hash_password", lambda *_: "hash")
    body = dict(login="doc", password="secret")
    if email is not None:
        body["email"] = email
    response = client(database).post("/api/staff/doctors/d/assign-access", json=body,
        headers={"Authorization": "Bearer " + token("oldlogin")})
    assert response.status_code == 200
    assert not any("email" in q and not q["email"] for q in queries)
    assert {"login": "doc"} in queries
    assert database.doctors.docs[0]["email"] == "contact@example.com"
    assert database.doctors.writes == []
    credentials = [d for d in database.users.docs if d["_id"] == "d"]
    assert len(credentials) == 1
    assert credentials[0]["login"] == "doc"
    assert credentials[0]["hashed_password"] == "hash"
    assert database.staff.docs[0]["login"] == "doc"


@pytest.mark.parametrize("body", [dict(password="secret"), dict(email="", login="", password="secret")])
def test_doctor_grant_requires_email_or_login(body):
    database = db([user()])
    database.doctors.docs.append(dict(id="d", is_active=True))
    response = client(database).post("/api/staff/doctors/d/assign-access", json=body,
        headers={"Authorization": "Bearer " + token("oldlogin")})
    assert response.status_code == 400
    assert database.users.writes == database.staff.writes == database.doctors.writes == []


@pytest.mark.asyncio
@pytest.mark.parametrize("email,login", [(None, None), ("", "")])
async def test_doctor_service_requires_email_or_login(email, login):
    database = db()
    database.doctors.docs.append(dict(id="d", is_active=True))
    with pytest.raises(ValueError):
        await StaffService(database).assign_access_to_doctor("d", email, "secret", login)
    assert database.users.writes == database.staff.writes == database.doctors.writes == []


@pytest.mark.asyncio
@pytest.mark.parametrize("email,login,field", [("taken@example.com", "", "email"), (None, "taken", "login")])
async def test_doctor_grant_collision_before_writes(email, login, field):
    database = db([dict(_id="other", **{field: email if field == "email" else login})])
    database.doctors.docs.append(dict(id="d", is_active=True))
    with pytest.raises(ValueError):
        await StaffService(database).assign_access_to_doctor("d", email, "secret", login)
    assert database.users.writes == database.staff.writes == database.doctors.writes == []
