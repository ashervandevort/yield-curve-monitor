"""Shared FRED spot curve sync for daily cron and conditional catch-up retries."""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any, Optional

from .config import settings
from .curve_store import get_curve_store
from .fred_client import fred_client
from .market_calendar import expected_latest_observation_date

OVERLAP_DAYS = 5
BOOTSTRAP_DAYS = 14
FULL_BACKFILL_DAYS = 730


def resolve_fetch_window(store) -> tuple[str, str, str]:
    """Return (start, end, mode) for the incremental FRED pull."""
    end = datetime.now().strftime("%Y-%m-%d")

    if os.getenv("FRED_FULL_BACKFILL") == "1":
        start = (datetime.now() - timedelta(days=FULL_BACKFILL_DAYS)).strftime("%Y-%m-%d")
        return start, end, "full_backfill"

    max_date = store.max_stored_date()
    if max_date:
        start = (
            datetime.strptime(max_date, "%Y-%m-%d") - timedelta(days=OVERLAP_DAYS)
        ).strftime("%Y-%m-%d")
        return start, end, "incremental"

    start = (datetime.now() - timedelta(days=BOOTSTRAP_DAYS)).strftime("%Y-%m-%d")
    return start, end, "bootstrap"


def spot_sync_status(tenors: Optional[list[str]] = None) -> dict[str, Any]:
    """Return whether stored spot is behind the expected session close."""
    tenor_list = tenors or list(settings.FULL_TENORS)
    store = get_curve_store()
    cached = store.latest_complete_curve(tenor_list) or store.latest_curve(tenor_list)
    stored_date = cached.date if cached else None
    expected = expected_latest_observation_date().isoformat()
    behind = fred_client._observation_behind_expected(stored_date)
    return {
        "stored_date": stored_date,
        "expected_date": expected,
        "behind_expected": behind,
        "tenors": tenor_list,
    }


async def run_fred_spot_sync(*, force: bool = False) -> dict[str, Any]:
    """
    Incremental FRED history + latest snapshot refresh.

    When force=False (catch-up), skip FRED calls if already at expected close.
    """
    if not settings.FRED_API_KEY:
        raise RuntimeError("FRED_API_KEY not configured")

    tenors = list(settings.FULL_TENORS)
    status = spot_sync_status(tenors)

    if not force and not status["behind_expected"]:
        return {
            **status,
            "action": "skipped",
            "mode": None,
            "latest_date": status["stored_date"],
        }

    store = get_curve_store()
    start, end, mode = resolve_fetch_window(store)
    rows_before = store.row_count()
    max_before = store.max_stored_date()

    history = await fred_client.fetch_curve_history(start, end, tenors)
    latest = await fred_client.get_yield_curve(tenors=tenors, refresh=True)
    latest_date = latest.get("date")
    still_behind = fred_client._observation_behind_expected(latest_date)

    return {
        **status,
        "action": "synced",
        "mode": mode,
        "start": start,
        "end": end,
        "history_rows": len(history),
        "rows_before": rows_before,
        "rows_after": store.row_count(),
        "max_before": max_before,
        "max_after": store.max_stored_date(),
        "latest_date": latest_date,
        "still_behind_expected": still_behind,
    }
