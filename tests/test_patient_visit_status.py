"""Статус пациента: новый vs повторный (только completed-приёмы)."""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from services.patient_status import matches_returning_filter, patient_visit_status


@pytest.mark.parametrize(
    "completed_count,expected",
    [
        (0, "new"),
        (None, "new"),
        (1, "returning"),
        (5, "returning"),
    ],
)
def test_patient_visit_status(completed_count, expected):
    assert patient_visit_status(completed_count) == expected


@pytest.mark.parametrize(
    "is_returning,completed_count,expected",
    [
        (None, 0, True),
        ("all", 0, True),
        ("all", 3, True),
        ("new", 0, True),
        ("new", 1, False),
        ("returning", 0, False),
        ("returning", 1, True),
        ("returning", 2, True),
        # незавершённые / scheduled не считаются — completed_count=0 → новый
        ("new", 0, True),
    ],
)
def test_matches_returning_filter(is_returning, completed_count, expected):
    assert matches_returning_filter(is_returning, completed_count) is expected


def test_scheduled_appointment_does_not_make_returning():
    """Запись scheduled/cancelled не делает пациента повторным."""
    completed_count = 0  # scheduled и cancelled не входят в count
    assert patient_visit_status(completed_count) == "new"
    assert matches_returning_filter("new", completed_count)
    assert not matches_returning_filter("returning", completed_count)


def test_one_completed_makes_returning():
    assert patient_visit_status(1) == "returning"
    assert matches_returning_filter("returning", 1)
    assert not matches_returning_filter("new", 1)


@pytest.mark.asyncio
async def test_refresh_patient_appointments_count():
    class FakeAppointments:
        async def count_documents(self, query):
            assert query["patient_id"] == "p1"
            assert query["status"] == "completed"
            return 2

    class FakePatients:
        def __init__(self):
            self.last_update = None

        async def update_one(self, filters, update):
            self.last_update = (filters, update)

    class FakeDB:
        def __init__(self):
            self.appointments = FakeAppointments()
            self.patients = FakePatients()

    from services.patient_status import refresh_patient_appointments_count

    db = FakeDB()
    count = await refresh_patient_appointments_count(db, "p1")
    assert count == 2
    filters, update = db.patients.last_update
    assert filters == {"id": "p1"}
    assert update["$set"]["appointments_count"] == 2


@pytest.mark.asyncio
async def test_refresh_skips_empty_patient_id():
    from services.patient_status import refresh_patient_appointments_count

    count = await refresh_patient_appointments_count(None, "")
    assert count == 0
