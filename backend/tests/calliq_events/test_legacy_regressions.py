"""Run existing integration regressions against this suite's network-free mock DB."""

import importlib.util
from pathlib import Path

for filename in (
    "test_telephony",
    "test_telephony_calliq",
    "test_calliq_client",
    "test_staff_extension",
    "test_crm_lead_calls",
):
    spec = importlib.util.spec_from_file_location(
        filename, Path(__file__).parents[1] / (filename + ".py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for name, value in vars(module).items():
        if (
            name.startswith("test_")
            or hasattr(value, "_pytestfixturefunction")
            or hasattr(value, "_fixture_function")
        ):
            globals()[name] = value


async def test_protected_telephony_read_still_requires_authentication(
    clean_db, monkeypatch
):
    import httpx
    import server

    monkeypatch.setattr("database.db", clean_db)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        assert (await client.get("/api/telephony/calls")).status_code in (401, 403)


async def test_protected_telephony_read_rejects_mixed_clinic(clean_db, auth_client):
    await clean_db.telephony_calls.insert_one(
        {"clinic_id": "different-clinic", "pbx_call_id": "foreign"}
    )
    assert (await auth_client.get("/api/telephony/calls")).status_code == 403
