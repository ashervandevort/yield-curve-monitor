#!/usr/bin/env python3
"""
Daily macro calendar sync — incremental FRED release dates + scheduled forward dates.

Usage:
  cd backend && source venv/bin/activate
  python scripts/cron/macro_daily.py

Full 730-day FRED backfill (one-off):
  MACRO_FULL_BACKFILL=1 python scripts/cron/macro_daily.py

Cron (deploy252):
  15 23 * * 1-5  cd /var/www/yield-curve/backend && ./venv/bin/python scripts/cron/macro_daily.py >> /var/log/yield-curve-macro.log 2>&1
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

load_dotenv(BACKEND_ROOT / '.env')
load_dotenv(BACKEND_ROOT.parent / '.env')

from app.core.macro_calendar import macro_calendar  # noqa: E402
from app.core.macro_store import macro_store  # noqa: E402


async def run_daily_sync() -> None:
    full = os.getenv('MACRO_FULL_BACKFILL') == '1'
    print(f'[{datetime.now().isoformat()}] macro sync start (full_backfill={full})')
    print(f'  rows before: {macro_store.row_count()}')

    synced = await macro_calendar.sync_all(refresh=True, full_backfill=full)
    csv_path = macro_store.export_csv()

    print(f'  releases synced: {synced}')
    print(f'  rows after: {macro_store.row_count()}')
    print(f'  csv export: {csv_path}')
    print('Done.')


if __name__ == '__main__':
    asyncio.run(run_daily_sync())
