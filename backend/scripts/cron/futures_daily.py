#!/usr/bin/env python3
"""Daily Treasury futures pull from Yahoo Finance.

Cron (deploy252 — installed via scripts/cron/install_crontab.sh on deploy):
  30 23 * * 1-5  → futures_daily.py
  Logs: ~/logs/yield-curve/futures.log
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / '.env')
load_dotenv(BACKEND_ROOT.parent / '.env')

from app.core.futures_client import fetch_and_store_daily, fetch_history  # noqa: E402
import os  # noqa: E402


def main() -> None:
    print(f'[{datetime.now().isoformat()}] yfinance futures sync')
    if os.getenv('FUTURES_FULL_BACKFILL') == '1':
        result = fetch_history(days=400)
        print(f'  Backfill stored rows: {result["stored_rows"]}')
    else:
        result = fetch_and_store_daily(lookback_days=10)
        print(f'  Stored rows: {result["stored_rows"]}')
        if result.get('errors'):
            for err in result['errors']:
                print(f'  WARN: {err}')
    print('Done.')


if __name__ == '__main__':
    main()
