#!/usr/bin/env python3
"""
Conditional FRED catch-up — retry only when spot is behind expected close.

Runs at staggered times after the primary fred_daily job (late evening +
next morning) so we pick up FRED DGS releases without waiting 24h for cron.

Usage:
  python scripts/cron/fred_catchup.py

Force sync even if current:
  FRED_CATCHUP_FORCE=1 python scripts/cron/fred_catchup.py

Cron (via install_crontab.sh):
  30 23,1,13,15 * * 1-5  → fred_catchup.py  (~7:30 PM, 9:30 PM, 9 AM, 11 AM ET)
  Logs: ~/logs/yield-curve/fred_catchup.log
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")
load_dotenv(BACKEND_ROOT.parent / ".env")

from app.core.fred_sync import run_fred_spot_sync  # noqa: E402


async def main() -> None:
    force = os.getenv("FRED_CATCHUP_FORCE") == "1"
    print(f"[{datetime.now().isoformat()}] fred_catchup (force={force})")

    result = await run_fred_spot_sync(force=force)

    if result["action"] == "skipped":
        print(
            f"  skip — stored {result['stored_date']} "
            f"meets expected {result['expected_date']}"
        )
        return

    print(f"  synced ({result['mode']}): {result['start']} → {result['end']}")
    print(f"  stored max: {result['max_before'] or 'none'} → {result['max_after'] or 'none'}")
    print(f"  latest curve: {result['latest_date']} (expected {result['expected_date']})")
    if result["still_behind_expected"]:
        print("  still behind FRED publication — will retry on next catchup slot")
    else:
        print("  caught up")
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
