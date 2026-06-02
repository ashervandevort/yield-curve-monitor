#!/usr/bin/env python3
"""Apply CTD/conversion-factor updates from DEFAULT_CTD or a JSON file.

When CME publishes a new cheapest-to-deliver, update DEFAULT_CTD in futures_ctd.py
or pass --json path, then run:

  python scripts/cron/ctd_refresh.py

Or POST /api/v1/futures/ctd for a single contract.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / '.env')

from app.core.futures_ctd import DEFAULT_CTD  # noqa: E402
from app.core import futures_store  # noqa: E402
from app.core.futures_client import fetch_and_store_daily  # noqa: E402


def apply_seed(effective_date: str | None = None) -> None:
    effective_date = effective_date or datetime.now().strftime('%Y-%m-%d')
    for sym, meta in DEFAULT_CTD.items():
        futures_store.upsert_ctd(
            sym,
            effective_date,
            meta['cusip'],
            meta['coupon_pct'],
            meta['maturity'],
            meta['conversion_factor'],
            source='seed',
        )
    print(f'Applied CTD seed for {len(DEFAULT_CTD)} symbols effective {effective_date}')


def apply_json(path: Path, effective_date: str | None = None) -> None:
    payload = json.loads(path.read_text())
    effective_date = effective_date or datetime.now().strftime('%Y-%m-%d')
    for sym, meta in payload.items():
        futures_store.upsert_ctd(
            sym.upper(),
            effective_date,
            meta['cusip'],
            meta['coupon_pct'],
            meta['maturity'],
            meta['conversion_factor'],
            meta.get('source', 'manual'),
        )
    print(f'Applied CTD from {path} ({len(payload)} symbols)')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--json', type=Path, help='JSON map symbol -> CTD fields')
    parser.add_argument('--effective-date', type=str)
    parser.add_argument('--recompute', action='store_true', help='Re-fetch yfinance after CF update')
    args = parser.parse_args()

    if args.json:
        apply_json(args.json, args.effective_date)
    else:
        apply_seed(args.effective_date)

    if args.recompute:
        result = fetch_and_store_daily(lookback_days=30)
        print(f'Recomputed implied yields: {result["stored_rows"]} rows')


if __name__ == '__main__':
    main()
