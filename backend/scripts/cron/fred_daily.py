#!/usr/bin/env python3
"""
Daily FRED Treasury yield update — append-only incremental sync.

Usage:
  cd /var/www/yield-curve/backend && source venv/bin/activate
  python scripts/cron/fred_daily.py

Full 730-day backfill (migration only):
  FRED_FULL_BACKFILL=1 python scripts/cron/fred_daily.py

Cron (deploy252 — installed via scripts/cron/install_crontab.sh on deploy):
  30 22 * * 1-5  → fred_daily.py   (~6:30 PM ET in EDT)
  Logs: ~/logs/yield-curve/fred.log
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")
load_dotenv(BACKEND_ROOT.parent / ".env")

from app.core.config import settings  # noqa: E402
from app.core.fred_client import fred_client  # noqa: E402
from app.core.curve_store import get_curve_store  # noqa: E402

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


async def run_daily_update() -> None:
    """Append recent curve history and refresh the latest snapshot."""
    if not settings.FRED_API_KEY:
        raise SystemExit("FRED_API_KEY not configured")

    tenors = list(settings.FULL_TENORS)
    store = get_curve_store()
    start, end, mode = resolve_fetch_window(store)
    rows_before = store.row_count()
    max_before = store.max_stored_date()

    print(
        f"[{datetime.now().isoformat()}] {mode}: {len(tenors)} tenors, "
        f"{start} → {end} (stored max: {max_before or 'none'})"
    )

    history = await fred_client.fetch_curve_history(start, end, tenors)
    print(f"  History rows in frame: {len(history)}")
    print(f"  Store rows before: {rows_before}")

    latest = await fred_client.get_yield_curve(tenors=tenors, refresh=True)
    print(f"  Latest curve: {latest.get('date')} ({len(latest.get('yields', {}))} tenors)")

    print(f"  Store rows after: {store.row_count()}")
    print(f"  Stored max date: {store.max_stored_date()}")
    print("Done.")


if __name__ == "__main__":
    asyncio.run(run_daily_update())
