"""Process-local broadcaster. Only the authenticated route registers sockets."""

import asyncio
import logging

from fastapi import WebSocket

from events import ApplicationEvent

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self, send_timeout: float = 2):
        self._clients: dict[WebSocket, asyncio.Lock] = {}
        self.send_timeout = send_timeout

    @property
    def connection_count(self):
        return len(self._clients)

    async def connect(self, websocket: WebSocket):
        await websocket.send_json({"type": "connection.ready", "version": 1})
        self._clients[websocket] = asyncio.Lock()

    def disconnect(self, websocket: WebSocket):
        self._clients.pop(websocket, None)

    async def _close(self, websocket, code):
        try:
            await asyncio.wait_for(websocket.close(code=code), self.send_timeout)
        except Exception:
            pass  # Already closed or unresponsive.

    async def broadcast(self, event: ApplicationEvent):
        payload = event.model_dump(mode="json")

        async def deliver(websocket, lock):
            try:
                async def send():
                    async with lock:
                        await websocket.send_json(payload)
                await asyncio.wait_for(send(), self.send_timeout)
            except Exception:
                self.disconnect(websocket)
                logger.warning("Removing failed notification socket", exc_info=True)
                await self._close(websocket, 1011)

        await asyncio.gather(*(deliver(ws, lock) for ws, lock in tuple(self._clients.items())))

    async def close_all(self):
        clients = tuple(self._clients)
        self._clients.clear()
        await asyncio.gather(*(self._close(ws, 1001) for ws in clients))


websocket_manager = WebSocketManager()
