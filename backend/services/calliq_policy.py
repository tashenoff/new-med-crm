"""Explicit policy knobs; derived outcomes require a separate opt-in."""

from dataclasses import dataclass
import os


def integer(name, default, minimum, maximum):
    value = int(os.getenv(name, str(default)))
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


@dataclass(frozen=True)
class PolicySettings:
    derived_enabled: bool
    quiet_seconds: int
    stable_seconds: int
    interval_seconds: int
    initial_delay_seconds: int
    review_after_seconds: int
    followup_seconds: int
    max_attempts: int = 6


def policy_settings():
    enabled = os.getenv("CALLIQ_DERIVED_MISSED_ENABLED", "false").strip().lower()
    if enabled not in ("true", "false"):
        raise ValueError("CALLIQ_DERIVED_MISSED_ENABLED must be true or false")
    quiet = integer("CALLIQ_MISSED_QUIET_SECONDS", 900, 900, 7200)
    stable = integer("CALLIQ_MISSED_STABLE_SECONDS", 600, 600, 3600)
    interval = integer("CALLIQ_RECONCILE_INTERVAL_SECONDS", 600, 600, 3600)
    review = integer(
        "CALLIQ_REVIEW_AFTER_SECONDS", 14400, quiet + stable + interval, 86400
    )
    return PolicySettings(
        enabled == "true",
        quiet,
        stable,
        interval,
        integer("CALLIQ_RECONCILE_INITIAL_DELAY_SECONDS", 90, 0, 3600),
        review,
        integer("CALLIQ_MISSED_FOLLOWUP_SECONDS", 3600, 600, 86400),
    )
