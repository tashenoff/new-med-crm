"""Configuration boundaries tested without CRM startup or real credentials/data."""
import ast
import asyncio
from dataclasses import asdict
import importlib
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import patch

import httpx
import pytest
from fastapi import APIRouter, FastAPI

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

from reporting.access_contract import ACCESS_PATH
from reporting.api import router as closed_finance
from reporting.amounts_due import PATH as AMOUNTS_DUE_PATH
from reporting.amounts_due_api import router as closed_amounts_due
from reporting.services_rendered import PATH as SERVICES_RENDERED_PATH
from reporting.services_rendered_api import router as closed_services_rendered
from reporting.breakdown import PATH as BREAKDOWN_PATH
from reporting.breakdown_api import router as closed_breakdown
from reporting.contract import PATH, ReportError
from reporting.live_access import AGENT_ID, API_ORIGIN, PAPERCLIP_RUNTIME
from reporting.payroll import PATH as PAYROLL_PATH
from reporting.payroll_api import router as closed_payroll
from test_live_adapters import BINDING, PERIOD, TOKEN, Store, database
from tools.finance_mcp.synthetic import load_synthetic_salary

BINDING_DATA = {key: asdict(BINDING)[key] for key in
                ("clinic_id", "owner_id", "database_namespace", "single_clinic_confirmed")}
BOOTSTRAP = "tools.finance_mcp.http_bootstrap"
BAD_BINDINGS = [
    "", "{", "[]", "null", json.dumps({**BINDING_DATA, "extra": "PRIVATE"}),
    *[json.dumps({key: value for key, value in BINDING_DATA.items() if key != missing})
      for missing in BINDING_DATA],
    *[json.dumps({**BINDING_DATA, **changes}) for changes in (
        {"clinic_id": ""}, {"clinic_id": "invalid clinic"}, {"owner_id": 1},
        {"owner_id": ""}, {"owner_id": "x" * 65}, {"database_namespace": ""},
        {"database_namespace": 1}, {"single_clinic_confirmed": False},
        {"single_clinic_confirmed": 1}, {"single_clinic_confirmed": "true"},
        {"api_origin": "https://wrong.invalid"}, {"agent_id": "other"},
        {"paperclip_runtime": "https://wrong.invalid"})],
    json.dumps(BINDING_DATA)[:-1] + ', "clinic_id": "duplicate"}',
    json.dumps(BINDING_DATA).replace('"single_clinic_confirmed": true', '"single_clinic_confirmed": NaN'),
    json.dumps(BINDING_DATA).replace('"single_clinic_confirmed": true', '"single_clinic_confirmed": Infinity'),
    json.dumps(BINDING_DATA) + " trailing",
    b"\xff", b" " * 16_385,
]


@pytest.fixture
def config(tmp_path):
    path = tmp_path / "binding.json"
    path.write_text(json.dumps(BINDING_DATA), encoding="utf-8")
    return {"REPORTING_BINDING_FILE": str(path),
            "REPORTING_GRANT_FILE": str(tmp_path / "synthetic-never-created-grants.json")}


def select(db, environment):
    return importlib.import_module("reporting.activation").select_reporting_routers(db, environment)


def mount(routers):
    app = FastAPI()
    for router in routers:
        app.include_router(router)
    return app


def report_routes(app):
    return [(route.path, route.methods) for route in app.routes if route.path.startswith("/api/reporting/") and not route.path.startswith("/api/reporting/oauth/")]


async def assert_closed(routers):
    assert routers == (closed_finance, closed_breakdown, closed_amounts_due, closed_services_rendered, closed_payroll)
    app = mount(routers)
    assert report_routes(app) == [(PATH, {"GET"}), (BREAKDOWN_PATH, {"GET"}), (AMOUNTS_DUE_PATH, {"GET"}),
                                 (SERVICES_RENDERED_PATH, {"GET"}), (PAYROLL_PATH, {"GET"})]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=API_ORIGIN) as client:
        for path in (PATH, BREAKDOWN_PATH, AMOUNTS_DUE_PATH, SERVICES_RENDERED_PATH, PAYROLL_PATH):
            assert (await client.get(path, params=PERIOD)).status_code == 401
            response = await client.get(path, params=PERIOD, headers={"Authorization": "Bearer " + TOKEN})
            assert response.status_code == 503
            assert response.json()["detail"] == {"code": "REPORTING_UNCONFIGURED", "complete": False}
        assert (await client.get(ACCESS_PATH)).status_code == 404


@pytest.mark.parametrize("changes", [
    {"REPORTING_BINDING_FILE": None, "REPORTING_GRANT_FILE": None},
    {"REPORTING_BINDING_FILE": None}, {"REPORTING_GRANT_FILE": None},
    {"REPORTING_BINDING_FILE": ""}, {"REPORTING_GRANT_FILE": ""},
    {"REPORTING_BINDING_FILE": "relative.json"}, {"REPORTING_GRANT_FILE": "relative.json"},
    {"REPORTING_BINDING_FILE": 123}, {"REPORTING_GRANT_FILE": 123},
    {"REPORTING_BINDING_FILE": "C:relative.json" if os.name == "nt" else "relative.json"},
])
def test_absent_partial_and_invalid_paths_stay_closed(config, changes):
    environment = {key: value for key, value in {**config, **changes}.items() if value is not None}
    with patch.object(Path, "open", side_effect=AssertionError("No partial configuration reads")) as opened:
        routers = select(database(), environment)
    opened.assert_not_called()
    asyncio.run(assert_closed(routers))


@pytest.mark.parametrize("raw", BAD_BINDINGS, ids=[f"binding-{index}" for index in range(len(BAD_BINDINGS))])
def test_malformed_binding_closes_backend_and_rejects_bootstrap(config, raw, capsys, caplog):
    path = Path(config["REPORTING_BINDING_FILE"])
    path.write_bytes(raw if isinstance(raw, bytes) else raw.encode())
    asyncio.run(assert_closed(select(database(), config)))
    with patch.dict(os.environ, {"FINANCE_MCP_BINDING_FILE": str(path)}, clear=True):
        with pytest.raises(ReportError, match="^REPORTING_UNCONFIGURED$"):
            runpy.run_module(BOOTSTRAP)
    assert capsys.readouterr() == ("", "")
    assert caplog.text == ""


@pytest.mark.parametrize("failure", ["missing", "directory", "permission", "namespace", "construction"])
def test_optional_configuration_failures_do_not_break_crm(config, failure, caplog):
    activation = importlib.import_module("reporting.activation")
    db = database()
    path = Path(config["REPORTING_BINDING_FILE"])
    if failure == "missing":
        path.unlink()
    elif failure == "directory":
        config["REPORTING_BINDING_FILE"] = str(path.parent)
    elif failure == "namespace":
        db.name = "other-database"
    if failure in {"permission", "construction"}:
        target = "pathlib.Path.open" if failure == "permission" else "reporting.activation.build_bound_routers"
        with patch(target, side_effect=RuntimeError("PRIVATE CONFIG CONTENTS")):
            routers = activation.select_reporting_routers(db, config)
    else:
        routers = activation.select_reporting_routers(db, config)
    asyncio.run(assert_closed(routers))
    assert caplog.text == ""
    assert db.users.reads + db.staff.reads + db.treatment_plans.reads == []


def test_valid_activation_uses_existing_db_and_only_two_environment_keys(config):
    activation = importlib.import_module("reporting.activation")
    db, store = database(), Store()
    reads = []

    class Environment:
        def get(self, key):
            reads.append(key)
            assert key in config
            return config[key]

    with patch.object(activation, "JsonGrantStore", return_value=store) as constructor:
        routers = select(db, Environment())
    constructor.assert_called_once_with(config["REPORTING_GRANT_FILE"])
    assert reads == ["REPORTING_BINDING_FILE", "REPORTING_GRANT_FILE"]
    assert db.users.reads + db.staff.reads + db.doctors.reads + db.treatment_plans.reads == []
    assert store.reads == 0  # Grants are re-read at request time, not at startup.
    assert len(routers) == 7
    app = mount(routers)
    assert report_routes(app) == [(PATH, {"GET"}), (BREAKDOWN_PATH, {"GET"}), (AMOUNTS_DUE_PATH, {"GET"}),
                                 (SERVICES_RENDERED_PATH, {"GET"}), (PAYROLL_PATH, {"GET"}), (ACCESS_PATH, {"GET"})]

    async def check():
        load_synthetic_salary()
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=API_ORIGIN,
                                    headers={"Authorization": "Bearer " + TOKEN}) as client:
            metadata = await client.get(ACCESS_PATH)
            assert metadata.status_code == 200
            assert metadata.json()["allowed_tools"] == ["get_finance_summary", "get_finance_breakdown", "get_amounts_due", "get_services_rendered", "get_payroll_summary"]
            assert db.doctors.reads + db.treatment_plans.reads + db.appointments.reads == []
            assert (await client.get(PATH, params=PERIOD)).json()["report"]["gross_recorded_receipts_kzt"] == "0.00"
            assert (await client.get(PAYROLL_PATH, params=PERIOD)).json()["report"]["accrued_kzt"] == "125.00"
            store.grants = ()
            assert (await client.get(ACCESS_PATH)).status_code == 403
    asyncio.run(check())


@pytest.mark.parametrize("configured", [False, True])
def test_actual_global_server_registrations_mount_one_set_in_place(config, configured):
    # Execute only actual router imports/registrations, never production server startup.
    tree = ast.parse((ROOT / "backend/server.py").read_text(encoding="utf-8"))
    nodes = [node for node in tree.body if
             (isinstance(node, ast.ImportFrom) and node.module.startswith("reporting.")) or
             any(isinstance(child, ast.Call) and isinstance(child.func, ast.Attribute)
                 and isinstance(child.func.value, ast.Name) and child.func.value.id == "app"
                 and child.func.attr == "include_router" for child in ast.walk(node))]
    assert sum(isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
               and node.func.id == "select_reporting_routers" for node in ast.walk(tree)) == 1
    app = FastAPI()
    context = {"app": app, "db": database(), "os": SimpleNamespace(environ=config if configured else {})}
    for node in ast.walk(ast.Module(body=nodes, type_ignores=[])):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "include_router":
            if isinstance(node.args[0], ast.Name):
                name = node.args[0].id
                sentinel = APIRouter()
                sentinel.add_api_route("/__" + name, lambda: None, methods=["GET"])
                context[name] = sentinel
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "server-router-registrations", "exec"), context)
    expected = [(PATH, {"GET"}), (BREAKDOWN_PATH, {"GET"}), (AMOUNTS_DUE_PATH, {"GET"}), (PAYROLL_PATH, {"GET"})]
    if configured:
        expected.append((ACCESS_PATH, {"GET"}))
    assert report_routes(app) == expected
    paths = [route.path for route in app.routes]
    start = paths.index("/api/__auth_router")
    assert paths[start + 1:start + 1 + len(expected)] == [path for path, _ in expected]
    oauth_count = 6 if configured else 0
    assert paths[start + 1 + len(expected) + oauth_count] == "/api/__live_events_router"
    assert paths.count("/api/crm/__crm_router") == 1
    assert paths.index("/api/crm/__crm_router") > start + len(expected)
    assert paths[-1] == "/__lookups_router"


def test_bootstrap_passes_only_valid_fixed_binding_to_factory(config):
    with patch.dict(os.environ, {"FINANCE_MCP_BINDING_FILE": config["REPORTING_BINDING_FILE"]}, clear=True):
        with patch("tools.finance_mcp.http_server.create_http_app") as factory:
            result = runpy.run_module(BOOTSTRAP)
    factory.assert_called_once()
    assert factory.call_args.args == (BINDING,)
    assert factory.call_args.kwargs == {}  # Sidecar never receives/opens OAuth state.
    binding = factory.call_args.args[0]
    assert (binding.agent_id, binding.api_origin, binding.paperclip_runtime) == (AGENT_ID, API_ORIGIN, PAPERCLIP_RUNTIME)
    assert result["app"] is factory.return_value


def test_grok_activation_uses_separate_lazy_store_without_env_or_paperclip_changes(config):
    activation = importlib.import_module("reporting.activation")
    with patch("reporting.grok_oauth.OAuthFileStore.read", side_effect=AssertionError("No OAuth state at startup")):
        with patch.object(activation, "build_bound_routers") as build:
            select(database(), config)
    assert build.call_args.kwargs["oauth_store"].path == (
        Path(config["REPORTING_BINDING_FILE"]).parent / "grok-oauth" / "grok-oauth.json")


@pytest.mark.parametrize("path", [None, "", "relative.json", "C:relative.json" if os.name == "nt" else "relative.json"])
def test_bootstrap_requires_explicit_absolute_path(path):
    environment = {} if path is None else {"FINANCE_MCP_BINDING_FILE": path}
    with patch.dict(os.environ, environment, clear=True):
        with pytest.raises(ReportError, match="^REPORTING_UNCONFIGURED$"):
            runpy.run_module(BOOTSTRAP)


def test_fresh_http_and_bootstrap_import_without_fastapi_credentials_or_listener(config):
    code = '''
import importlib.abc
import os
from pathlib import Path
import sys
class BlockBackend(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in {'fastapi', 'database', 'server', 'motor', 'pymongo', 'routers', 'services'}:
            raise AssertionError('Backend dependency imported: ' + fullname)
sys.meta_path.insert(0, BlockBackend())
class Environment(dict):
    def __getitem__(self, key):
        assert key not in {'MONGO_URL', 'MONGO_DB_NAME', 'SECRET_KEY', 'CRM_PASSWORD', 'FINANCE_MCP_TOKEN', 'REPORTING_GRANT_FILE'}
        return super().__getitem__(key)
    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default
os.environ = Environment(os.environ)
def audit(event, args):
    if event in {'socket.bind', 'socket.connect', 'subprocess.Popen'}:
        raise AssertionError('Import started network/process')
    if event == 'open' and isinstance(args[0], (str, bytes)):
        assert Path(os.fsdecode(args[0])).name not in {'.env', 'synthetic-never-created-grants.json'}
sys.addaudithook(audit)
from tools.finance_mcp.http_server import app as closed_app
from tools.finance_mcp.http_bootstrap import app
from reporting.live_access import AGENT_ID, API_ORIGIN, PAPERCLIP_RUNTIME
endpoint = app.routes[0].endpoint
assert endpoint.binding.agent_id == AGENT_ID
assert endpoint.binding.api_origin == API_ORIGIN
assert endpoint.binding.paperclip_runtime == PAPERCLIP_RUNTIME
assert closed_app.routes[0].endpoint.binding is None
assert not any(name.split('.')[0] in {'fastapi', 'database', 'server', 'motor', 'pymongo'} for name in sys.modules)
print('ISOLATED_BOOTSTRAP_OK')
'''
    environment = {"PYTHONUTF8": "1", "PYTHONNOUSERSITE": "1",
                   "FINANCE_MCP_BINDING_FILE": config["REPORTING_BINDING_FILE"]}
    if sys.platform == "win32":
        environment["SystemRoot"] = os.environ["SystemRoot"]
    result = subprocess.run([sys.executable, "-B", "-c", code], cwd=ROOT, env=environment,
                            capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "ISOLATED_BOOTSTRAP_OK"
