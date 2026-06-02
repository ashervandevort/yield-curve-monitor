"""
CTD metadata and conversion factors for Treasury futures.

Conversion factors are published by CME when the deliverable basket changes.
Update via scripts/cron/ctd_refresh.py or POST /api/v1/futures/ctd when CME publishes new values.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional

# Yahoo Finance continuous symbols
YFINANCE_SYMBOLS: dict[str, str] = {
    'ZT': 'ZT=F',
    'ZF': 'ZF=F',
    'ZN': 'ZN=F',
    'TN': 'TN=F',
    'ZB': 'ZB=F',
    'UB': 'UB=F',
}

# Seed CTD — update when CME switches cheapest-to-deliver (see ctd_refresh / futures_ctd table)
DEFAULT_CTD: dict[str, dict] = {
    'ZT': {
        'cusip': '91282CML2',
        'coupon_pct': 4.125,
        'maturity': '2027-05-15',
        'conversion_factor': 0.9708,
    },
    'ZF': {
        'cusip': '91282CNC1',
        'coupon_pct': 4.0,
        'maturity': '2030-05-15',
        'conversion_factor': 0.9395,
    },
    'ZN': {
        'cusip': '91282CMM0',
        'coupon_pct': 4.125,
        'maturity': '2034-11-15',
        'conversion_factor': 0.9041,
    },
    'TN': {
        'cusip': '91282CMH9',
        'coupon_pct': 4.625,
        'maturity': '2044-02-15',
        'conversion_factor': 0.9232,
    },
    'ZB': {
        'cusip': '912810TW8',
        'coupon_pct': 4.25,
        'maturity': '2054-05-15',
        'conversion_factor': 0.8216,
    },
    'UB': {
        'cusip': '912810UK2',
        'coupon_pct': 4.875,
        'maturity': '2054-11-15',
        'conversion_factor': 0.9032,
    },
}


@dataclass(frozen=True)
class CtdSpec:
    symbol: str
    cusip: str
    coupon_pct: float
    maturity: str
    conversion_factor: float
    effective_date: str
    source: str = 'seed'


def tenor_for_symbol(symbol: str) -> str:
    mapping = {'ZT': '2Y', 'ZF': '5Y', 'ZN': '10Y', 'TN': '10Y', 'ZB': '30Y', 'UB': '30Y'}
    return mapping.get(symbol, '10Y')
