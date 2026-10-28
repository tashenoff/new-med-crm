"""Explicit clinic-local month bounds, without changing timestamps or rights."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from services.admin_bonus_period import bonus_timezone, month_bounds, report_context


@pytest.mark.parametrize("configured", [None, "", " ", "invalid/Zone", "/etc/passwd"])
def test_timezone_is_explicit_and_has_no_utc_bishkek_or_machine_fallback(monkeypatch, configured):
    if configured is None:
        monkeypatch.delenv("ADMIN_BONUS_TIMEZONE", raising=False)
    else:
        monkeypatch.setenv("ADMIN_BONUS_TIMEZONE", configured)
    monkeypatch.setenv("TZ", "Asia/Bishkek")
    with pytest.raises(HTTPException) as error:
        bonus_timezone()
    assert error.value.status_code == 503
    assert "ADMIN_BONUS_TIMEZONE" in error.value.detail


def test_almaty_month_uses_local_midnight_converted_to_utc():
    first, following = month_bounds("2026-10", ZoneInfo("Asia/Almaty"))
    assert first == datetime(2026, 9, 30, 19, tzinfo=timezone.utc)
    assert following == datetime(2026, 10, 31, 19, tzinfo=timezone.utc)


def test_parameter_is_used_instead_of_hardcoded_zone(monkeypatch):
    monkeypatch.setenv("ADMIN_BONUS_TIMEZONE", "Asia/Almaty")
    assert month_bounds("2026-10", bonus_timezone())[0].hour == 19
    monkeypatch.setenv("ADMIN_BONUS_TIMEZONE", "Asia/Bishkek")
    assert month_bounds("2026-10", bonus_timezone())[0].hour == 18


def test_context_current_month_comes_from_clinic_zone_not_host_timezone(monkeypatch):
    monkeypatch.setenv("ADMIN_BONUS_TIMEZONE", "Asia/Almaty")
    monkeypatch.setenv("TZ", "America/New_York")
    assert report_context(datetime(2026, 9, 30, 18, 59, 59, tzinfo=timezone.utc)) == dict(timezone="Asia/Almaty", current_month="2026-09")
    assert report_context(datetime(2026, 9, 30, 19, tzinfo=timezone.utc)) == dict(timezone="Asia/Almaty", current_month="2026-10")


def test_december_leap_year_and_dst_boundaries():
    zone = ZoneInfo("Asia/Almaty")
    assert month_bounds("2026-12", zone) == (datetime(2026, 11, 30, 19, tzinfo=timezone.utc), datetime(2026, 12, 31, 19, tzinfo=timezone.utc))
    assert month_bounds("2028-02", zone) == (datetime(2028, 1, 31, 19, tzinfo=timezone.utc), datetime(2028, 2, 29, 19, tzinfo=timezone.utc))
    first, following = month_bounds("2026-10", ZoneInfo("Europe/Berlin"))
    assert first == datetime(2026, 9, 30, 22, tzinfo=timezone.utc)
    assert following == datetime(2026, 10, 31, 23, tzinfo=timezone.utc)


@pytest.mark.parametrize("month", ["bad", "2026-1", "2026-13", "0000-01", "9999-12", None])
def test_invalid_period_is_rejected(month):
    with pytest.raises(HTTPException) as error:
        month_bounds(month, ZoneInfo("Asia/Almaty"))
    assert error.value.status_code == 422
