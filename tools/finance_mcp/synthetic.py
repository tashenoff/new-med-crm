"""Explicit synthetic HTTP fixture; no real identity provider, grant issuance or DB."""
from copy import deepcopy
from datetime import datetime, timezone
import socket
import threading
import time

from fastapi import FastAPI
import uvicorn

from reporting.access import AccessContext, AgentGrant, UserIdentity
from reporting.amounts_due import AmountsDueSnapshot, SCOPE as AMOUNTS_DUE_SCOPE
from reporting.amounts_due_api import create_amounts_due_router
from reporting.services_rendered import ServicesRenderedSnapshot, SCOPE as SERVICES_RENDERED_SCOPE
from reporting.services_rendered_api import create_services_rendered_router
from reporting.api import create_router
from reporting.breakdown import SCOPE as BREAKDOWN_SCOPE
from reporting.breakdown_api import create_breakdown_router
from reporting.contract import SCOPE
from reporting.service import CoverageEvidence, Snapshot
from .core import MARKER
from reporting.payroll import PayrollSnapshot, SCOPE as PAYROLL_SCOPE
from reporting.payroll_api import create_payroll_router

UTC = timezone.utc
DEMO_CONTEXT = AccessContext(
    UserIdentity("demo-owner", True, frozenset({"finance_view"}), frozenset({"demo-clinic"})),
    AgentGrant("demo-finance-agent", "demo-owner", "demo-clinic", True, frozenset({SCOPE}), datetime(2099, 1, 1, tzinfo=UTC)),
)
DEMO_COVERAGE = CoverageEvidence("demo-clinic", datetime(2026, 1, 1, tzinfo=UTC),
    datetime(2027, 1, 1, tzinfo=UTC), True, True, 0, "synthetic_demo")
PAYROLL_CONTEXT = AccessContext(
    UserIdentity("demo-owner", True, frozenset({"payroll_view"}), frozenset({"demo-clinic"})),
    AgentGrant("demo-finance-agent", "demo-owner", "demo-clinic", True, frozenset({PAYROLL_SCOPE}), datetime(2099, 1, 1, tzinfo=UTC)),
)
PAYROLL_SNAPSHOT = PayrollSnapshot(
    (dict(id="synthetic-doctor", clinic_id="demo-clinic", is_active=True, full_name="SYNTHETIC PRIVATE NAME",
          phone="SYNTHETIC PRIVATE PHONE", consultation_compensation_mode="separate",
          consultation_payment_type="fixed", consultation_payment_value=125, consultation_currency="KZT",
          payment_type="fixed", payment_value=10, currency="KZT", services=[]),),
    (), tuple(dict(id=f"appointment-{index}", clinic_id="demo-clinic", doctor_id="synthetic-doctor",
        status="completed", appointment_date=timestamp, patient_name="SYNTHETIC PRIVATE PATIENT")
        for index, timestamp in enumerate(("2026-10-18T17:59:59.999999Z", "2026-10-18T18:00:00Z",
                                          "2026-10-19T17:59:59.999999Z", "2026-10-19T18:00:00Z"))),
    DEMO_COVERAGE,
)


def load_synthetic_salary():
    # Avoid the legacy services/__init__.py, which eagerly imports unrelated DB services.
    # Only the existing salary engine and its pure accounting dependency are loaded.
    import importlib
    from pathlib import Path
    import sys
    from types import ModuleType
    if "services" not in sys.modules:
        package = ModuleType("services")
        package.__path__ = [str(Path(__file__).resolve().parents[2] / "backend" / "services")]
        sys.modules["services"] = package
    return importlib.import_module("services.salary_service")


def event(identifier, kind, value, when, clinic="demo-clinic"):
    return dict(event_id=identifier, kind=kind, amount_kzt=value, occurred_at=when, clinic_id=clinic, currency="KZT")


DEMO_EVENTS = (
    event("service", "service_receipt", "100.10", "2026-10-18T18:00:00Z"),
    event("component", "component_receipt", "25.20", "2026-10-19T00:00:00Z"),
    event("session", "session_receipt", "74.70", "2026-10-19T17:59:59.999999Z"),
    event("advance", "plan_advance", "80.00", "2026-10-19T12:00:00Z"),
    event("allocation", "service_advance_allocation", "80.00", "2026-10-19T13:00:00Z"),
    event("assignment", "patient_deposit_received", "50.00", "2026-10-19T13:00:00Z"),
    event("completion", "service_completion", "0.00", "2026-10-19T13:00:00Z"),
    event("before", "service_receipt", "1000.00", "2026-10-18T17:59:59.999999Z"),
    event("after", "service_receipt", "999.00", "2026-10-19T18:00:00Z"),
    event("foreign", "service_receipt", "900000.00", "2026-10-19T12:00:00Z", "other-clinic"),
)


class SyntheticBackend:
    def __init__(self):
        self.context = DEMO_CONTEXT
        self.snapshot = Snapshot(deepcopy(DEMO_EVENTS), DEMO_COVERAGE)
        self.payroll_context = PAYROLL_CONTEXT
        self.payroll_snapshot = deepcopy(PAYROLL_SNAPSHOT)

        self.breakdown_context = AccessContext(
            UserIdentity("demo-owner", True, frozenset({"finance_view"}), frozenset({"demo-clinic"})),
            AgentGrant("demo-finance-agent", "demo-owner", "demo-clinic", True, frozenset({BREAKDOWN_SCOPE}), datetime(2099, 1, 1, tzinfo=UTC)),
        )
        self.amounts_due_context = AccessContext(
            UserIdentity("demo-owner", True, frozenset({"finance_view"}), frozenset({"demo-clinic"})),
            AgentGrant("demo-finance-agent", "demo-owner", "demo-clinic", True, frozenset({AMOUNTS_DUE_SCOPE}), datetime(2099, 1, 1, tzinfo=UTC)),
        )
        self.amounts_due_snapshot = AmountsDueSnapshot((), DEMO_COVERAGE)
        self.services_rendered_context = AccessContext(
            UserIdentity("demo-owner", True, frozenset({"finance_view"}), frozenset({"demo-clinic"})),
            AgentGrant("demo-finance-agent", "demo-owner", "demo-clinic", True,
                       frozenset({SERVICES_RENDERED_SCOPE}), datetime(2099, 1, 1, tzinfo=UTC)),
        )
        self.services_rendered_snapshot = ServicesRenderedSnapshot((), DEMO_COVERAGE)
        self.context_reads = 0
        self.source_reads = 0
        self.marker = MARKER
        self.app = FastAPI()

        async def resolve_context(request):
            self.context_reads += 1
            return self.context  # Test-harness injection, NOT HTTP authentication.

        async def read_snapshot(scope, period):
            self.source_reads += 1
            return self.snapshot

        self.app.include_router(create_router(resolve_context, read_snapshot))

        async def resolve_payroll_context(request):
            self.context_reads += 1
            return self.payroll_context

        async def read_payroll_snapshot(scope, period):
            self.source_reads += 1
            return self.payroll_snapshot

        self.app.include_router(create_payroll_router(resolve_payroll_context, read_payroll_snapshot))

        async def resolve_breakdown_context(request):
            self.context_reads += 1
            return self.breakdown_context

        async def read_breakdown_snapshot(scope, period):
            self.source_reads += 1
            return self.snapshot

        self.app.include_router(create_breakdown_router(resolve_breakdown_context, read_breakdown_snapshot))

        async def resolve_amounts_due_context(request):
            self.context_reads += 1
            return self.amounts_due_context

        async def read_amounts_due_snapshot(scope, period):
            self.source_reads += 1
            return self.amounts_due_snapshot

        self.app.include_router(create_amounts_due_router(resolve_amounts_due_context, read_amounts_due_snapshot))

        async def resolve_services_rendered_context(request):
            self.context_reads += 1
            return self.services_rendered_context

        async def read_services_rendered_snapshot(scope, period):
            self.source_reads += 1
            return self.services_rendered_snapshot

        self.app.include_router(create_services_rendered_router(
            resolve_services_rendered_context, read_services_rendered_snapshot))

        @self.app.middleware("http")
        async def mark_synthetic(request, call_next):
            response = await call_next(request)
            if self.marker:
                response.headers["X-Finance-Synthetic"] = self.marker
            return response


class SyntheticHttpStand:
    """Own ephemeral loopback socket; never connects to existing CRM ports."""
    def __init__(self):
        self.backend = SyntheticBackend()
        self.socket = None
        self.server = None
        self.thread = None

    def start(self):
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.bind(("127.0.0.1", 0))
        self.origin = "http://127.0.0.1:" + str(self.socket.getsockname()[1])
        config = uvicorn.Config(self.backend.app, host="127.0.0.1", log_level="critical", access_log=False, lifespan="off")
        self.server = uvicorn.Server(config)
        self.thread = threading.Thread(target=self.server.run, kwargs={"sockets": [self.socket]}, daemon=True)
        self.thread.start()
        deadline = time.monotonic() + 5
        while not self.server.started and self.thread.is_alive() and time.monotonic() < deadline:
            time.sleep(.01)
        if not self.server.started:
            self.close()
            raise RuntimeError("Synthetic stand unavailable")
        return self

    def close(self):
        if self.server:
            self.server.should_exit = True
        if self.thread:
            self.thread.join(timeout=5)
        if self.socket:
            self.socket.close()
