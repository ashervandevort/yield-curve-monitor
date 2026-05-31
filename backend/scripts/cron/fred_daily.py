#!/usr/bin/env python3
"""
Daily FRED Treasury yield backfill — run on VPS after FRED publishes (~6 PM ET).

Usage:
  cd /var/www/yield-curve/backend && source venv/bin/activate
  python scripts/cron/fred_daily.py

Cron (deploy252):
  0 23 * * 1-5  cd /var/www/yield-curve/backend && ./venv/bin/python scripts/cron/fred_daily.py >> /var/log/yield-curve-fred.log 2>&1
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


async def backfill(days: int = 14) -> None:
    """Incremental daily update — only fetch recent days to stay under FRED rate limits."""
    if not settings.FRED_API_KEY:
        raise SystemExit("FRED_API_KEY not configured")

    tenors = list(settings.FULL_TENORS)
    end = datetime.now().strftime("%Y-%m-%d")
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    print(f"[{datetime.now().isoformat()}] Updating {len(tenors)} tenors: {start} → {end}")
    history = await fred_client.fetch_curve_history(start, end, tenors)
    store = get_curve_store()
    rows_before = getattr(store, "row_count", lambda: "?")()

    print(f"  History rows in frame: {len(history)}")
    print(f"  Store rows before: {rows_before}")

    # Refresh latest snapshot
    latest = await fred_client.get_yield_curve(tenors=tenors, refresh=True)
    print(f"  Latest curve: {latest.get('date')} ({len(latest.get('yields', {}))} tenors)")

    rows_after = getattr(store, "row_count", lambda: "?")()
    print(f"  Store rows after: {rows_after}")
    print("Done.")


if __name__ == "__main__":
    # Daily cron: 14-day window. Full history: FRED_BACKFILL_DAYS=730 (deploy/migration only).
    asyncio.run(backfill(int(os.getenv("FRED_BACKFILL_DAYS", "14"))))
