"""Isolated HTTP/WebSocket tests: signed JWTs, fake DB, no Mongo connections."""

import asyncio
from contextlib import asynccontextmanager
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from crm.routes.leads import leads_router
from crm.dependencies import get_database as get_crm_database
from crm.schemas.lead_schemas import LeadCreate, LeadUpdate
from crm.models.lead import Lead, LeadStatus
from crm.services.lead_service import LeadService
from events import CRMCardCreated, EventBus, event_bus
from routers import auth, live_events
from services.websocket_manager import WebSocketManager, websocket_manager


@pytest.fixture
def isolated_app():
    records = [{"id": identifier, "login": identifier, "email": f"{identifier}@example.com",
                "full_name": "Test User", "role": "administrator", "hashed_password": "unused"}
               for identifier in ("creator", "other")]

    async def find_user(query):
        return next((deepcopy(row) for row in records if all(row.get(k) == v for k, v in query.items())), None)

    db = SimpleNamespace(users=SimpleNamespace(find_one=AsyncMock(side_effect=find_user)),
                         crm_leads=SimpleNamespace(insert_one=AsyncMock()),
                         crm_tasks=SimpleNamespace(insert_one=AsyncMock()),
                         patients=SimpleNamespace(find_one=AsyncMock(return_value=None)))

    @asynccontextmanager
    async def lifespan(app):
        async with live_events.live_events_lifespan():
            yield

    app = FastAPI(lifespan=lifespan)
    app.include_router(live_events.router, prefix="/api")
    app.include_router(leads_router, prefix="/api/crm")
    app.dependency_overrides[auth.get_database] = lambda: db
    app.dependency_overrides[get_crm_database] = lambda: db
    return app, db, records


@pytest.fixture
def api(isolated_app):
    app, db, records = isolated_app
    with TestClient(app) as client:
        yield client, db, records
    assert websocket_manager.connection_count == 0


def lead_payload(name="New card"):
    return {"first_name": name, "phone": "+70000000000", "source": "website"}


def token(user="creator", **claims):
    return auth.create_access_token({"sub": user, "sub_type": "user_id", **claims})


def authenticate(socket, access_token=None):
    socket.send_json({"type": "authenticate", "token": access_token or token()})
    assert socket.receive_json() == {"type": "connection.ready", "version": 1}


@pytest.mark.parametrize("claims", [{"sub": "creator", "sub_type": "user_id"},
                                   {"sub": "creator@example.com"}, {"sub": "creator"}])
def test_authenticated_connect_reuses_all_existing_jwt_subject_formats(api, claims):
    client, db, _ = api
    with client.websocket_connect("/api/ws/events") as socket:
        authenticate(socket, auth.create_access_token(claims))
        assert websocket_manager.connection_count == 1
        db.users.find_one.assert_awaited()


@pytest.mark.parametrize("access_token", ["not-a-jwt", token("missing"),
    auth.create_access_token({"sub": "creator", "sub_type": "user_id"}, timedelta(seconds=-1)),
    auth.jwt.encode({"sub": "creator", "sub_type": "user_id"}, "wrong-key", algorithm=auth.ALGORITHM),
    auth.create_access_token({})])
def test_invalid_missing_user_expired_or_wrong_signature_rejected(api, access_token):
    client, _, _ = api
    with client.websocket_connect("/api/ws/events") as socket:
        socket.send_json({"type": "authenticate", "token": access_token})
        with pytest.raises(WebSocketDisconnect) as error:
            socket.receive_json()
        assert error.value.code == 1008
        assert websocket_manager.connection_count == 0


@pytest.mark.parametrize("message", [{}, {"type": "authenticate", "token": ""}, {"type": "other"}, []])
def test_unauthenticated_frames_rejected(api, message):
    client, _, _ = api
    with client.websocket_connect("/api/ws/events") as socket:
        socket.send_json(message)
        with pytest.raises(WebSocketDisconnect) as error:
            socket.receive_json()
        assert error.value.code == 1008
        assert websocket_manager.connection_count == 0


def test_no_handshake_times_out_without_registering(api, monkeypatch):
    monkeypatch.setattr(live_events, "AUTH_TIMEOUT", 0.01)
    with api[0].websocket_connect("/api/ws/events?token=ignored") as socket:
        with pytest.raises(WebSocketDisconnect) as error:
            socket.receive_json()
        assert error.value.code == 1008
        assert websocket_manager.connection_count == 0


def test_binary_handshake_is_rejected(api):
    with api[0].websocket_connect("/api/ws/events") as socket:
        socket.send_bytes(b"not a text authentication frame")
        with pytest.raises(WebSocketDisconnect) as error:
            socket.receive_json()
        assert error.value.code == 1008


@pytest.mark.parametrize("field,value", [("is_active", False),
    ("password_expires_at", auth.datetime.utcnow() - timedelta(days=1))])
def test_inactive_or_password_expired_users_rejected(api, field, value):
    client, _, records = api
    records[0][field] = value
    with client.websocket_connect("/api/ws/events") as socket:
        socket.send_json({"type": "authenticate", "token": token()})
        with pytest.raises(WebSocketDisconnect) as error:
            socket.receive_json()
        assert error.value.code == 1008


def test_connection_closes_at_jwt_expiry(api):
    import time
    with api[0].websocket_connect("/api/ws/events") as socket:
        authenticate(socket, auth.jwt.encode({"sub": "creator", "sub_type": "user_id", "exp": time.time() + 0.2},
                                            auth.SECRET_KEY, algorithm=auth.ALGORITHM))
        with pytest.raises(WebSocketDisconnect) as error:
            socket.receive_json()
        assert error.value.code == 1008


def test_http_creation_broadcasts_to_every_active_client_including_creator(api):
    client, db, _ = api
    with client.websocket_connect("/api/ws/events") as creator, client.websocket_connect("/api/ws/events") as other:
        authenticate(creator)
        authenticate(other, token("other"))
        response = client.post("/api/crm/leads/", json=lead_payload("New card"), headers={"Authorization": f"Bearer {token()}"})
        assert response.status_code == 200, response.text
        first = creator.receive_json()
        assert first == other.receive_json()
        assert set(first) == {"version", "event_id", "type", "entity_type", "timestamp", "card_id", "title"}
        assert first["card_id"] == response.json()["id"]
        assert first["event_id"] == f"crm.card.created:lead:{first['card_id']}"
        assert first["title"] == "New card"
        assert first["type"] == "crm.card.created"
        assert first["entity_type"] == "lead"
        assert first["timestamp"].endswith("Z")
        db.crm_leads.insert_one.assert_awaited_once()
        db.crm_tasks.insert_one.assert_awaited_once()


def test_disconnect_cleanup_and_delivery_to_remaining_client(api):
    client, _, _ = api
    with client.websocket_connect("/api/ws/events") as remaining:
        authenticate(remaining)
        with client.websocket_connect("/api/ws/events") as departing:
            authenticate(departing, token("other"))
            assert websocket_manager.connection_count == 2
        # Execute on the app loop after the departing endpoint has been cancelled.
        assert client.portal.call(lambda: websocket_manager.connection_count) == 1
        assert client.post("/api/crm/leads/", json=lead_payload("After disconnect")).status_code == 200
        assert remaining.receive_json()["title"] == "After disconnect"


async def test_event_emitted_only_after_insert_finishes(monkeypatch):
    order = []

    async def insert(document):
        await asyncio.sleep(0)
        order.append("persisted")

    async def publish(event):
        assert order == ["persisted"]
        order.append("published")
        assert isinstance(event, CRMCardCreated)
        assert event.title == "Created"

    monkeypatch.setattr(event_bus, "publish", publish)
    db = SimpleNamespace(crm_leads=SimpleNamespace(insert_one=insert),
                         crm_tasks=SimpleNamespace(insert_one=AsyncMock()))
    lead = await LeadService(db).create_lead(LeadCreate(**lead_payload("Created")))
    assert lead.id
    assert order == ["persisted", "published"]


def test_failed_insert_does_not_emit(api, monkeypatch):
    publish = AsyncMock()
    monkeypatch.setattr(event_bus, "publish", publish)
    client, db, _ = api
    db.crm_leads.insert_one.side_effect = RuntimeError("insert failed")
    assert client.post("/api/crm/leads/", json=lead_payload("Failed")).status_code == 400
    publish.assert_not_awaited()


def test_publish_failure_preserves_successful_http_response(api, monkeypatch, caplog):
    monkeypatch.setattr(event_bus, "publish", AsyncMock(side_effect=RuntimeError("broadcast failed")))
    response = api[0].post("/api/crm/leads/", json=lead_payload("Persisted"))
    assert response.status_code == 200, response.text
    assert response.json()["first_name"] == "Persisted"
    assert "Could not emit crm.card.created" in caplog.text


@pytest.mark.parametrize("created_by", ["telephony_webhook", "wazzup_webhook", "hms_integration"])
async def test_automated_creations_share_the_same_event_path(api, monkeypatch, created_by):
    publish = AsyncMock()
    monkeypatch.setattr(event_bus, "publish", publish)
    lead = await LeadService(api[1]).create_lead(LeadCreate(**lead_payload()), created_by=created_by)
    publish.assert_awaited_once()
    event = publish.await_args.args[0]
    assert event.card_id == lead.id
    assert event.entity_type == "lead"
    assert event.event_id == f"crm.card.created:lead:{lead.id}"


def test_persisted_card_is_not_silenced_by_existing_initial_task_failure(api, monkeypatch):
    publish = AsyncMock()
    monkeypatch.setattr(event_bus, "publish", publish)
    client, db, _ = api
    db.crm_tasks.insert_one.side_effect = RuntimeError("task failed")
    # Existing task error behavior stays intact, but the lead is already stored.
    response = client.post("/api/crm/leads/", json=lead_payload())
    assert response.status_code == 400
    db.crm_leads.insert_one.assert_awaited_once()
    publish.assert_awaited_once()


def test_failed_broadcast_subscriber_preserves_successful_api_response(api, monkeypatch, caplog):
    # Use the real bus and broadcaster; a failed transport must not fail HTTP.
    monkeypatch.setattr(websocket_manager, "broadcast", AsyncMock(side_effect=RuntimeError("transport failed")))
    # The lifespan has captured the original bound method, so register this
    # failing transport explicitly alongside it for this test only.
    unsubscribe = event_bus.subscribe(websocket_manager.broadcast)
    try:
        response = api[0].post("/api/crm/leads/", json=lead_payload())
        assert response.status_code == 200, response.text
        assert "Application event delivery failed" in caplog.text
    finally:
        unsubscribe()


async def test_updates_status_changes_and_conversions_do_not_emit(monkeypatch):
    publish = AsyncMock()
    monkeypatch.setattr(event_bus, "publish", publish)
    db = SimpleNamespace(crm_leads=SimpleNamespace(update_one=AsyncMock(
        return_value=SimpleNamespace(modified_count=1))))
    service = LeadService(db)
    lead = Lead(id="existing", **lead_payload())
    monkeypatch.setattr(service, "get_lead_by_id", AsyncMock(return_value=lead))
    monkeypatch.setattr(service, "canonical_document", AsyncMock(return_value={"id": lead.id}))
    assert await service.update_lead(lead.id, LeadUpdate(first_name="Updated")) is lead
    assert await service.update_lead_status(lead.id, LeadStatus.CONTACTED) is lead
    assert await service.convert_to_client(lead.id, "client-id") is lead
    assert db.crm_leads.update_one.await_count == 3
    publish.assert_not_awaited()


async def test_failed_or_stalled_socket_does_not_block_other_clients(caplog):
    manager = WebSocketManager(send_timeout=0.01)
    healthy, broken, stalled = [Mock(send_json=AsyncMock(), close=AsyncMock()) for _ in range(3)]
    for socket in (healthy, broken, stalled):
        await manager.connect(socket)
        socket.send_json.reset_mock()
    broken.send_json.side_effect = RuntimeError("dead connection")

    async def hang(payload):
        await asyncio.Event().wait()

    stalled.send_json.side_effect = hang
    event = CRMCardCreated(event_id="crm.card.created:lead:1", card_id="1", title="Created", timestamp=datetime.now(timezone.utc))
    await manager.broadcast(event)
    healthy.send_json.assert_awaited_once_with(event.model_dump(mode="json"))
    assert manager.connection_count == 1
    assert "Removing failed notification socket" in caplog.text
    await manager.close_all()
    assert manager.connection_count == 0
    healthy.close.assert_awaited_once_with(code=1001)
    broken.close.assert_awaited_once_with(code=1011)


async def test_event_bus_isolates_subscriber_failure_and_unsubscribes(caplog):
    bus = EventBus()
    broken = AsyncMock(side_effect=RuntimeError("subscriber failed"))
    healthy = AsyncMock()
    unsubscribe = bus.subscribe(healthy)
    bus.subscribe(broken)
    event = CRMCardCreated(event_id="crm.card.created:lead:1", card_id="1", title="Created", timestamp=auth.datetime.utcnow())
    await bus.publish(event)
    healthy.assert_awaited_once_with(event)
    assert "Application event delivery failed" in caplog.text
    unsubscribe()
    await bus.publish(event)
    healthy.assert_awaited_once()


async def test_native_uvicorn_websocket_transport_on_loopback(isolated_app):
    """Exercise Uvicorn's actual WS driver, not just the ASGI test client."""
    import json
    import socket

    import httpx
    import uvicorn
    from websockets import connect

    app, _, _ = isolated_app
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
    config = uvicorn.Config(app, log_level="error", ws="websockets", lifespan="on")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve(sockets=[listener]))
    try:
        async def wait_for_startup():
            while not server.started:
                if task.done():
                    await task
                    raise AssertionError("Server stopped before startup")
                await asyncio.sleep(0.01)

        await asyncio.wait_for(wait_for_startup(), 5)
        url = f"ws://127.0.0.1:{port}/api/ws/events"
        async with connect(url) as creator, connect(url) as other, connect(url) as pending_auth:
            for client, subject in ((creator, "creator"), (other, "other")):
                await client.send(json.dumps({"type": "authenticate", "token": token(subject)}))
                assert json.loads(await asyncio.wait_for(client.recv(), 2))["type"] == "connection.ready"
            async with httpx.AsyncClient() as http:
                response = await http.post(f"http://127.0.0.1:{port}/api/crm/leads/", json=lead_payload("Native socket"))
            assert response.status_code == 200
            messages = await asyncio.wait_for(asyncio.gather(creator.recv(), other.recv()), 2)
            assert messages[0] == messages[1]
            assert json.loads(messages[0])["card_id"] == response.json()["id"]
            # An accepted transport without JWT authentication receives no event.
            assert websocket_manager.connection_count == 2
            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(pending_auth.recv(), 0.03)
    finally:
        server.should_exit = True
        await asyncio.wait_for(task, 5)
        listener.close()
    assert websocket_manager.connection_count == 0
