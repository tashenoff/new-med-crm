"""Run the existing auth boundary suite with database/network creation forbidden."""
from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "backend")]


def main():
    from tools.finance_mcp.synthetic import load_synthetic_salary
    load_synthetic_salary()
    stub = types.ModuleType("database")
    stub.db = object()
    stub.get_database = lambda: None
    sys.modules["database"] = stub
    import motor.motor_asyncio
    import pymongo
    import pytest
    import socket

    def blocked(*args, **kwargs):
        raise AssertionError("No real DB or outbound socket in auth tests")

    motor.motor_asyncio.AsyncIOMotorClient = blocked
    pymongo.MongoClient = blocked
    socket.create_connection = blocked
    return pytest.main(["--noconftest", "-o", "asyncio_mode=auto", "-p", "no:cacheprovider",
        str(ROOT / "backend/tests/mock_only/test_permission_boundary.py"), "-q", "--tb=short", "--disable-warnings"])


if __name__ == "__main__":
    raise SystemExit(main())
