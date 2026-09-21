"""
Test setup for MedCRM backend.

Tests run against a SEPARATE test database (medcrm_test) on the SAME local
MongoDB instance used by the dev .env (localhost:27017). The real `medcrm`
database is never touched: every test starts (and ends) with the touched
collections dropped in medcrm_test only.

pytest-asyncio is enabled globally via pytest.ini (asyncio_mode=auto), so
`async def test_...` and `async def` fixtures run automatically.
"""
import os

# Force a separate test DB BEFORE `database` (and thus motor) is imported.
# backend/.env sets DB_NAME=medcrm; we must not clobber that into tests.
os.environ["DB_NAME"] = "medcrm_test"

from dotenv import load_dotenv  # noqa: E402

# Load MONGO_URL (and anything else) from backend/.env; load_dotenv does NOT
# override already-set env vars, so DB_NAME stays medcrm_test.
load_dotenv()

from pymongo import MongoClient  # noqa: E402

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402,F401  (registers the asyncio plugin)

TOUCHED_COLLECTIONS = [
    "service_prices",
    "doctors",
    "appointments",
    "treatment_plans",
]


def _drop_touched_collections():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017/?authSource=admin")
    dbname = os.environ["DB_NAME"]
    sync = MongoClient(mongo_url, serverSelectionTimeoutMS=4000)
    try:
        for coll in TOUCHED_COLLECTIONS:
            sync[dbname][coll].drop()
    finally:
        sync.close()


@pytest_asyncio.fixture
async def clean_db():
    """Provide a fresh motor db handle to medcrm_test, emptied of touched collections.

    A dedicated client is created per test (not the shared `database.db`) so it
    binds to THIS test's event loop; otherwise a shared motor client leaks the
    previous loop and later tests die with "Event loop is closed".
    """
    _drop_touched_collections()
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017/?authSource=admin")
    dbname = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=4000)
    db = client[dbname]

    yield db

    _drop_touched_collections()
    close = client.close()
    if hasattr(close, "__await__"):  # motor's close is a coroutine depending on version
        await close