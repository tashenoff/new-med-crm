"""Explicit clinic-local bonus periods; receipt storage remains UTC.

No shared configurable clinic timezone exists in this CRM. Do not inherit the
unrelated hard-coded Bishkek reporting zone or the server/browser local zone.
"""
from datetime import datetime, timezone
import os
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException

ENV_NAME = "ADMIN_BONUS_TIMEZONE"


def bonus_timezone():
    name = os.environ.get(ENV_NAME, "").strip()
    if not name:
        raise HTTPException(503, "Set ADMIN_BONUS_TIMEZONE to the clinic's confirmed IANA timezone before using the bonus register")
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(503, "ADMIN_BONUS_TIMEZONE must be a valid IANA timezone") from None


def report_context(now=None):
    zone = bonus_timezone()
    instant = now or datetime.now(timezone.utc)
    if instant.tzinfo is None:
        raise ValueError("Context clock must be timezone-aware")
    return dict(timezone=zone.key, current_month=instant.astimezone(zone).strftime("%Y-%m"))


def month_bounds(month, zone):
    try:
        first = datetime.strptime(month, "%Y-%m").replace(tzinfo=zone)
        if first.strftime("%Y-%m") != month or first.year in (1, 9999):
            raise ValueError
        following = first.replace(year=first.year + 1, month=1) if first.month == 12 else first.replace(month=first.month + 1)
        return first.astimezone(timezone.utc), following.astimezone(timezone.utc)
    except (ValueError, TypeError, OverflowError):
        raise HTTPException(422, "Use a valid YYYY-MM report month") from None
