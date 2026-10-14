"""Default channel selection without database or network access."""

import asyncio
import importlib
import socket
import sys
from types import ModuleType
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException


@pytest.fixture
def service(monkeypatch):
    import httpx
    import motor.motor_asyncio
    import pymongo

    def forbidden(*args, **kwargs):
        raise AssertionError("Database/network access is forbidden")

    monkeypatch.setattr(pymongo, "MongoClient", forbidden)
    monkeypatch.setattr(motor.motor_asyncio, "AsyncIOMotorClient", forbidden)
    monkeypatch.setattr(httpx, "AsyncClient", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    database = ModuleType("database")
    database.get_database = Mock(return_value=Mock())
    monkeypatch.setitem(sys.modules, "database", database)
    monkeypatch.setenv("WAZZUP24_API_KEY", "mock-only-token")
    monkeypatch.delitem(sys.modules, "services.wazzup_service", raising=False)
    module = importlib.import_module("services.wazzup_service")
    instance = module.WazzupService()
    monkeypatch.setattr(instance, "get_channels", AsyncMock())
    monkeypatch.setattr(instance, "_make_request", AsyncMock(return_value={
        "messageId": "mock-message", "messages": [],
    }))
    monkeypatch.setattr(instance, "save_message_to_db", AsyncMock())
    chats = ModuleType("services.wazzup_chat_service")
    chats.WazzupChatService = Mock()
    chats.WazzupChatService.return_value.upsert_outgoing = AsyncMock()
    chats.WazzupChatService.return_value.get_chat = AsyncMock(return_value=None)
    monkeypatch.setitem(sys.modules, "services.wazzup_chat_service", chats)
    documents = ModuleType("services.document_service")
    documents.DocumentService = Mock()
    monkeypatch.setitem(sys.modules, "services.document_service", documents)
    yield module, instance
    sys.modules.pop("services.wazzup_service", None)


def invoke(module, instance, operation, channel_id=None):
    if operation == "text":
        return asyncio.run(instance.send_message(module.SendMessageRequest(
            phone="+77010000000", text="Test", channel_id=channel_id)))
    if operation == "media":
        return asyncio.run(instance.send_media(
            "+77010000000", "https://example.invalid/test.pdf",
            module.MessageType.DOCUMENT, channel_id=channel_id))
    return asyncio.run(instance.get_chat_messages("+77010000000", channel_id=channel_id))


def assert_channel(instance, operation, expected):
    args = instance._make_request.call_args.args
    if operation == "history":
        assert args[1] == f"channels/{expected}/chats/77010000000@c.us/messages"
    else:
        assert args[2]["channelId"] == expected
        assert instance.save_message_to_db.call_args.kwargs["channel_id"] == expected


@pytest.mark.parametrize("operation", ["text", "media", "history"])
@pytest.mark.parametrize("active_status", ["active", "ACTIVE", "AcTiVe"])
@pytest.mark.parametrize("channel_id", [None, ""])
def test_first_active_channel_over_blocked(service, operation, active_status, channel_id):
    module, instance = service
    instance.get_channels.return_value = [
        module.WazzupChannel(id=str(index), name="Mock", type="whatsapp", status=status)
        for index, status in enumerate(["blocked", active_status, "blocked", "active"])
    ]
    invoke(module, instance, operation, channel_id)
    assert_channel(instance, operation, "1")
    instance.get_channels.assert_awaited_once_with()


@pytest.mark.parametrize("operation", ["text", "media", "history"])
@pytest.mark.parametrize("statuses", [[], ["blocked", "BLOCKED"], ["inactive", "connecting"]])
@pytest.mark.parametrize("channel_id", [None, ""])
def test_no_active_channel_raises_clear_error(service, operation, statuses, channel_id):
    module, instance = service
    instance.get_channels.return_value = [
        module.WazzupChannel(id=str(index), name="Mock", type="whatsapp", status=status)
        for index, status in enumerate(statuses)
    ]
    with pytest.raises(HTTPException) as error:
        invoke(module, instance, operation, channel_id)
    assert error.value.status_code == 500
    assert error.value.detail == "Нет активных каналов Wazzup24"
    instance._make_request.assert_not_awaited()
    instance.save_message_to_db.assert_not_awaited()


@pytest.mark.parametrize("operation", ["text", "media", "history"])
@pytest.mark.parametrize("channel_id", ["explicit-blocked-channel"])
def test_explicit_channel_id_is_preserved_without_lookup(service, operation, channel_id):
    module, instance = service
    instance.get_channels.side_effect = AssertionError("Explicit IDs must bypass discovery")
    invoke(module, instance, operation, channel_id)
    assert_channel(instance, operation, channel_id)
    instance.get_channels.assert_not_awaited()
