"""Yield curve spread definitions and computation."""
from __future__ import annotations

from typing import Callable

import pandas as pd

# Keys match GET /curve/spreads and GET /curve/spreads/history
SPREAD_KEYS = frozenset({
    '2s10s', '5s30s', '3m10y', '2s30s', '2s5s', '5s10s30s', '2s5s10s',
})

SpreadFn = Callable[[dict[str, float]], float | None]


def _long_short(long_t: str, short_t: str) -> SpreadFn:
    def compute(yields: dict[str, float]) -> float | None:
        if long_t not in yields or short_t not in yields:
            return None
        return (yields[long_t] - yields[short_t]) * 100

    return compute


def _bfly_5s10s30s(yields: dict[str, float]) -> float | None:
    if not all(t in yields for t in ('5Y', '10Y', '30Y')):
        return None
    return ((yields['5Y'] + yields['30Y']) / 2 - yields['10Y']) * 100


def _bfly_2s5s10s(yields: dict[str, float]) -> float | None:
    if not all(t in yields for t in ('2Y', '5Y', '10Y')):
        return None
    return ((yields['2Y'] + yields['10Y']) / 2 - yields['5Y']) * 100


SPREAD_FORMULAS: dict[str, SpreadFn] = {
    '2s10s': _long_short('10Y', '2Y'),
    '5s30s': _long_short('30Y', '5Y'),
    '3m10y': _long_short('10Y', '3M'),
    '2s30s': _long_short('30Y', '2Y'),
    '2s5s': _long_short('5Y', '2Y'),
    '5s10s30s': _bfly_5s10s30s,
    '2s5s10s': _bfly_2s5s10s,
}

SPREAD_DESCRIPTIONS: dict[str, str] = {
    '2s10s': '10Y minus 2Y',
    '5s30s': '30Y minus 5Y',
    '3m10y': '10Y minus 3M',
    '2s30s': '30Y minus 2Y',
    '2s5s': '5Y minus 2Y',
    '5s10s30s': '(5Y+30Y)/2 minus 10Y',
    '2s5s10s': '(2Y+10Y)/2 minus 5Y',
}

SPREAD_TENORS: dict[str, list[str]] = {
    '2s10s': ['2Y', '10Y'],
    '5s30s': ['5Y', '30Y'],
    '3m10y': ['3M', '10Y'],
    '2s30s': ['2Y', '30Y'],
    '2s5s': ['2Y', '5Y'],
    '5s10s30s': ['5Y', '10Y', '30Y'],
    '2s5s10s': ['2Y', '5Y', '10Y'],
}


_TENOR_ORDER = ['3M', '2Y', '5Y', '10Y', '30Y']


def tenors_for_spreads(spread_keys: list[str]) -> list[str]:
    """Union of tenors required to compute the requested spreads."""
    needed: set[str] = set()
    for key in spread_keys:
        needed.update(SPREAD_TENORS[key])
    return sorted(needed, key=lambda t: _TENOR_ORDER.index(t) if t in _TENOR_ORDER else 99)


def compute_spread_value(spread_key: str, yields: dict[str, float]) -> float | None:
    """Return spread in basis points, or None if tenors are missing."""
    fn = SPREAD_FORMULAS.get(spread_key)
    if fn is None:
        return None
    value = fn(yields)
    return round(value, 1) if value is not None else None


def compute_spread_series(history: pd.DataFrame, spread_key: str) -> list[dict]:
    """Build a time series for one spread from a pivoted yield history frame."""
    fn = SPREAD_FORMULAS[spread_key]
    series: list[dict] = []
    for date, row in history.iterrows():
        yields = {
            tenor: float(row[tenor])
            for tenor in SPREAD_TENORS[spread_key]
            if tenor in row.index and pd.notna(row[tenor])
        }
        if len(yields) != len(SPREAD_TENORS[spread_key]):
            continue
        value = fn(yields)
        if value is None:
            continue
        series.append({
            'date': date.strftime('%Y-%m-%d'),
            'value': round(value, 1),
        })
    return series


def spread_snapshot(spread_key: str, yields: dict[str, float]) -> dict | None:
    """Build a single-spread payload matching GET /curve/spreads shape."""
    value = compute_spread_value(spread_key, yields)
    if value is None:
        return None

    long_short_pairs = {
        '2s10s': ('10Y', '2Y'),
        '5s30s': ('30Y', '5Y'),
        '3m10y': ('10Y', '3M'),
        '2s30s': ('30Y', '2Y'),
        '2s5s': ('5Y', '2Y'),
    }
    interpretation = 'normal'
    if spread_key in long_short_pairs:
        long_t, short_t = long_short_pairs[spread_key]
        interpretation = 'steepening' if yields[long_t] > yields[short_t] else 'inverted'
        if spread_key == '3m10y':
            interpretation = 'normal' if yields[long_t] > yields[short_t] else 'inverted'
    elif spread_key in ('5s10s30s', '2s5s10s'):
        interpretation = 'normal' if value > 0 else 'inverted'

    return {
        'value': value,
        'description': SPREAD_DESCRIPTIONS[spread_key],
        'interpretation': interpretation,
    }
