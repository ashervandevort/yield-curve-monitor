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
  Staggered catch-up retries → fred_catchup.py (see install_crontab.sh)
  Logs: ~/logs/yield-curve/fred.log
"""
from __future__ import annotations

import asyncio
import sys
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")
load_dotenv(BACKEND_ROOT.parent / ".env")

from app.core.fred_sync import run_fred_spot_sync  # noqa: E402


async def run_daily_update() -> None:
    """Append recent curve history and refresh the latest snapshot."""
    print(f"[{datetime.now().isoformat()}] fred_daily (primary, force=True)")
    result = await run_fred_spot_sync(force=True)
    print(
        f"  {result['mode']}: {result.get('start')} → {result.get('end')} "
        f"(stored max: {result.get('max_before') or 'none'})"
    )
    print(f"  history rows in frame: {result.get('history_rows', 0)}")
    print(f"  latest curve: {result.get('latest_date')} (expected {result['expected_date']})")
    print(f"  store rows: {result.get('rows_before')} → {result.get('rows_after')}")
    print(f"  stored max after: {result.get('max_after')}")
    if result.get("still_behind_expected"):
        print("  note: FRED not yet at expected close — fred_catchup will retry tonight/morning")
    print("Done.")


if __name__ == "__main__":
    asyncio.run(run_daily_update())
