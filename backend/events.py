"""Typed application events, independent of notification transports."""

import asyncio
import logging
from datetime import datetime
from typing import Awaitable, Callable, Literal

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ApplicationEvent(BaseModel):
    version: Literal[1] = 1
    event_id: str
    type: str
    timestamp: datetime


class CRMCardCreated(ApplicationEvent):
    type: Literal["crm.card.created"] = "crm.card.created"
    entity_type: Literal["lead"] = "lead"
    card_id: str
    title: str


EventHandler = Callable[[ApplicationEvent], Awaitable[None]]


class EventBus:
    def __init__(self):
        self._handlers: set[EventHandler] = set()

    def subscribe(self, handler: EventHandler):
        self._handlers.add(handler)
        return lambda: self._handlers.discard(handler)

    async def publish(self, event: ApplicationEvent):
        async def deliver(handler):
            try:
                await asyncio.wait_for(handler(event), timeout=3)
            except Exception:
                logger.exception("Application event delivery failed: %s", event.event_id)

        await asyncio.gather(*(deliver(handler) for handler in tuple(self._handlers)))


event_bus = EventBus()
