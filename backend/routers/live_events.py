"""Authenticate with the HTTP JWT validator before admitting a live client."""

import asyncio
import time
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt
from pydantic import BaseModel, Field, ValidationError

from events import event_bus
from routers.auth import get_current_user, get_current_active_user, get_database
from services.websocket_manager import websocket_manager

router = APIRouter()
AUTH_TIMEOUT = 5


class Authenticate(BaseModel):
    type: Literal["authenticate"]
    token: str = Field(min_length=1, max_length=16384)


@asynccontextmanager
async def live_events_lifespan():
    unsubscribe = event_bus.subscribe(websocket_manager.broadcast)
    try:
        yield
    finally:
        unsubscribe()
        await websocket_manager.close_all()


@router.websocket("/ws/events")
async def live_events(websocket: WebSocket, db=Depends(get_database)):
    # Browser WebSocket cannot supply Authorization headers. Never register or
    # send application data before this first-frame authentication completes.
    await websocket.accept()
    try:
        auth = Authenticate.model_validate(await asyncio.wait_for(websocket.receive_json(), AUTH_TIMEOUT))
        user = await asyncio.wait_for(
            get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth.token), db),
            AUTH_TIMEOUT,
        )
        await get_current_active_user(user)
        # Claims are used only AFTER get_current_user has verified the signature
        # and expiry. Disconnect at expiry rather than keeping an expired session.
        expires_at = jwt.get_unverified_claims(auth.token).get("exp")
        async def can_receive(event=None):
            fresh = await get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth.token), db)
            await get_current_active_user(fresh)
            from clinic_boundary import assert_single_clinic
            await assert_single_clinic(db)
            return 'crm_view' in fresh.permissions and (event is None or event.type == 'crm.card.created')
        if not await can_receive():
            raise HTTPException(403, "CRM permission required")
        await websocket_manager.connect(websocket, authorize=can_receive)
        while True:
            remaining = None if expires_at is None else max(0, float(expires_at) - time.time())
            await asyncio.wait_for(websocket.receive_text(), remaining)
    except WebSocketDisconnect:
        pass
    except (HTTPException, ValidationError, ValueError, KeyError, TypeError, asyncio.TimeoutError):
        websocket_manager.disconnect(websocket)
        await websocket.close(code=1008)
    finally:
        websocket_manager.disconnect(websocket)
