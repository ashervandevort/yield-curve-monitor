#!/usr/bin/env python3
"""
One-time repair: rewrite recent FRED spot curve rows using complete-session logic.

Deletes mis-stamped or partial tail rows in the repair window, then re-upserts
only dates where all FULL_TENORS have FRED observations.

Usage (VPS):
  cd /var/www/yield-curve/backend && source venv/bin/activate
  python scripts/cron/fred_repair_recent.py

Optional:
  FRED_REPAIR_DAYS=90   # default 90, min 30, max 730
  FRED_REPAIR_DRY_RUN=1 # fetch + report only (no delete/write)
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
from app.core.curve_store import get_curve_store  # noqa: E402
from app.core.fred_client import fred_client  # noqa: E402

DEFAULT_DAYS = 90


async def dry_run_report(days: int) -> dict:
    """Summarize what a repair would touch without writing."""
    tenors = list(settings.FULL_TENORS)
    end = datetime.now().strftime("%Y-%m-%d")
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    store = get_curve_store()

    merged = await fred_client._fetch_merged_series(start, end, tenors)
    available = [t for t in tenors if t in merged.columns]
    complete = merged[available].dropna(how="any") if not merged.empty else merged
    complete_dates = {ts.strftime("%Y-%m-%d") for ts in complete.index}

    stored = store.curve_history(start, end, available)
    stored_dates = {ts.strftime("%Y-%m-%d") for ts in stored.index} if not stored.empty else set()
    partial_dates = sorted(stored_dates - complete_dates)

    return {
        "start": start,
        "end": end,
        "days_requested": days,
        "complete_fred_sessions": len(complete_dates),
        "stored_dates_in_window": len(stored_dates),
        "partial_dates_to_remove": partial_dates,
        "dry_run": True,
    }


async def main() -> None:
    if not settings.FRED_API_KEY:
        raise SystemExit("FRED_API_KEY not configured")

    days = int(os.getenv("FRED_REPAIR_DAYS", str(DEFAULT_DAYS)))
    dry_run = os.getenv("FRED_REPAIR_DRY_RUN") == "1"

    print(f"[{datetime.now().isoformat()}] FRED tail repair — last {days} days")
    print(f"  store backend: {settings.CURVE_STORE_BACKEND}")

    if dry_run:
        report = await dry_run_report(days)
        print(f"  DRY RUN — complete FRED sessions: {report['complete_fred_sessions']}")
        print(f"  stored dates in window: {report['stored_dates_in_window']}")
        if report["partial_dates_to_remove"]:
            print(f"  partial dates to remove: {', '.join(report['partial_dates_to_remove'])}")
        return

    before = get_curve_store().max_stored_date()
    result = await fred_client.repair_recent_curves(days=days)
    after = get_curve_store().max_stored_date()

    print(f"  window: {result['start']} → {result['end']}")
    print(f"  complete sessions rewritten: {result['complete_sessions_rewritten']}")
    print(f"  rows deleted: {result['rows_deleted']}")
    print(f"  partial dates removed: {result['partial_dates_removed']}")
    print(f"  stored max before/after: {before or 'none'} / {after or 'none'}")
    print(f"  latest curve date: {result['latest_date']}")
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
