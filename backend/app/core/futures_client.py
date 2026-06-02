"""Fetch Treasury futures from Yahoo Finance and persist with CTD-implied yields."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import pandas as pd

from app.core.futures_ctd import YFINANCE_SYMBOLS, tenor_for_symbol
from app.core.futures_implied import implied_yield_from_futures
from app.core import futures_store

logger = logging.getLogger(__name__)

FUTURES_SYMBOLS = list(YFINANCE_SYMBOLS.keys())


def _import_yfinance():
    try:
        import yfinance as yf
        return yf
    except ImportError as exc:
        raise RuntimeError('yfinance not installed') from exc


def fetch_and_store_daily(symbols: Optional[list[str]] = None, lookback_days: int = 5) -> dict[str, Any]:
    """Pull recent daily closes from yfinance and upsert SQLite."""
    yf = _import_yfinance()
    symbols = symbols or FUTURES_SYMBOLS
    end = date.today()
    start = end - timedelta(days=lookback_days)
    stored = 0
    errors: list[str] = []

    for sym in symbols:
        ticker = YFINANCE_SYMBOLS.get(sym)
        if not ticker:
            continue
        try:
            df = yf.download(ticker, start=start.isoformat(), end=(end + timedelta(days=1)).isoformat(), progress=False)
            if df is None or df.empty:
                errors.append(f'{sym}: no data')
                continue
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            close_col = 'Close' if 'Close' in df.columns else 'Adj Close'
            ctd = futures_store.latest_ctd(sym)
            for idx, row in df.iterrows():
                px = float(row[close_col])
                if pd.isna(px):
                    continue
                d = idx.strftime('%Y-%m-%d') if hasattr(idx, 'strftime') else str(idx)[:10]
                implied = None
                if ctd:
                    implied = implied_yield_from_futures(
                        px, ctd.conversion_factor, ctd.coupon_pct, ctd.maturity, d
                    )
                futures_store.upsert_daily(d, sym, px, implied)
                stored += 1
        except Exception as exc:
            logger.exception('yfinance fetch failed for %s', sym)
            errors.append(f'{sym}: {exc}')

    return {'stored_rows': stored, 'symbols': symbols, 'errors': errors}


def fetch_history(symbols: Optional[list[str]] = None, days: int = 400) -> dict[str, Any]:
    """Backfill longer history for chart/sparklines."""
    yf = _import_yfinance()
    symbols = symbols or FUTURES_SYMBOLS
    end = date.today()
    start = end - timedelta(days=days)
    stored = 0

    for sym in symbols:
        ticker = YFINANCE_SYMBOLS[sym]
        df = yf.download(ticker, start=start.isoformat(), end=(end + timedelta(days=1)).isoformat(), progress=False)
        if df is None or df.empty:
            continue
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        close_col = 'Close' if 'Close' in df.columns else 'Adj Close'
        ctd = futures_store.latest_ctd(sym)
        for idx, row in df.iterrows():
            px = float(row[close_col])
            if pd.isna(px):
                continue
            d = idx.strftime('%Y-%m-%d')
            implied = None
            if ctd:
                implied = implied_yield_from_futures(
                    px, ctd.conversion_factor, ctd.coupon_pct, ctd.maturity, d
                )
            futures_store.upsert_daily(d, sym, px, implied)
            stored += 1

    return {'stored_rows': stored}


async def get_futures_curve(symbols: Optional[list[str]] = None) -> dict[str, Any]:
    """Latest implied-yield curve keyed by futures symbol."""
    symbols = symbols or FUTURES_SYMBOLS
    prices = futures_store.latest_prices(symbols)
    if len(prices) < len(symbols):
        fetch_and_store_daily(symbols)
        prices = futures_store.latest_prices(symbols)

    yields: dict[str, float] = {}
    futures_detail: dict[str, dict] = {}
    obs_dates: list[str] = []

    for sym in symbols:
        row = prices.get(sym)
        if not row:
            continue
        obs_dates.append(row['date'])
        y = row.get('implied_yield')
        if y is not None:
            yields[sym] = float(y)
        ctd = futures_store.latest_ctd(sym, row['date'])
        futures_detail[sym] = {
            'price': row['close_price'],
            'implied_yield': y,
            'tenor': tenor_for_symbol(sym),
            'date': row['date'],
            'conversion_factor': ctd.conversion_factor if ctd else None,
            'ctd_cusip': ctd.cusip if ctd else None,
        }

    curve_date = max(obs_dates) if obs_dates else datetime.now(timezone.utc).strftime('%Y-%m-%d')

    return {
        'date': curve_date,
        'yields': yields,
        'futures': futures_detail,
        'metadata': {
            'source': 'yfinance+ctd',
            'note': 'Implied CTD yield from yfinance close × conversion factor',
            'symbols': symbols,
        },
    }


async def get_futures_changes(
    windows: list[str] | None = None,
    symbols: Optional[list[str]] = None,
) -> dict[str, dict[str, float]]:
    windows = windows or ['1D', '1W', '1M', '1Y']
    symbols = symbols or FUTURES_SYMBOLS
    window_days = {'1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365}

    latest = await get_futures_curve(symbols)
    latest_yields = latest['yields']
    latest_date = pd.Timestamp(latest['date']) if latest.get('date') else None
    if not latest_date or not latest_yields:
        return {}

    max_days = max(window_days.get(w, 1) for w in windows) + 10
    end_date = latest_date.strftime('%Y-%m-%d')
    start_date = (latest_date - timedelta(days=max_days)).strftime('%Y-%m-%d')
    hist = futures_store.history(start_date, end_date, symbols, field='implied_yield')

    changes: dict[str, dict[str, float]] = {}
    for window in windows:
        days = window_days.get(window, 1)
        target = latest_date - timedelta(days=days)
        window_changes: dict[str, float] = {}
        for sym in symbols:
            if sym not in latest_yields:
                continue
            series = hist.get(sym, [])
            prior_val = None
            for pt in reversed(series):
                if pd.Timestamp(pt['date']) <= target:
                    prior_val = pt['value']
                    break
            if prior_val is not None:
                window_changes[sym] = round((latest_yields[sym] - prior_val) * 100, 1)
        if window_changes:
            changes[window] = {
                'from_date': start_date,
                'to_date': end_date,
                'changes': window_changes,
            }
    return changes


def ff_implied_from_zq() -> Optional[float]:
    """30-day Fed Funds futures (ZQ=F): implied rate ≈ 100 - price."""
    yf = _import_yfinance()
    df = yf.download('ZQ=F', period='5d', progress=False)
    if df is None or df.empty:
        return None
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    px = float(df['Close'].iloc[-1])
    return round(100.0 - px, 4)
