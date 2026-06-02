"""SQLite persistence for Treasury futures (yfinance) and CTD metadata."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .config import settings
from app.core.futures_ctd import DEFAULT_CTD, CtdSpec


def _db_path() -> Path:
    return Path(settings.SQLITE_CACHE_PATH)


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    return conn


def init_futures_tables() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS futures_daily (
                date TEXT NOT NULL,
                symbol TEXT NOT NULL,
                close_price REAL NOT NULL,
                implied_yield REAL,
                source TEXT NOT NULL DEFAULT 'yfinance',
                fetched_at TEXT NOT NULL,
                PRIMARY KEY (date, symbol)
            );
            CREATE INDEX IF NOT EXISTS idx_futures_daily_symbol_date
                ON futures_daily(symbol, date);

            CREATE TABLE IF NOT EXISTS futures_ctd (
                symbol TEXT NOT NULL,
                effective_date TEXT NOT NULL,
                cusip TEXT NOT NULL,
                coupon_pct REAL NOT NULL,
                maturity TEXT NOT NULL,
                conversion_factor REAL NOT NULL,
                source TEXT NOT NULL DEFAULT 'seed',
                fetched_at TEXT NOT NULL,
                PRIMARY KEY (symbol, effective_date)
            );
            """
        )
        # Seed CTD rows if empty
        count = conn.execute("SELECT COUNT(*) FROM futures_ctd").fetchone()[0]
        if count == 0:
            now = datetime.now(timezone.utc).isoformat()
            today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            for sym, meta in DEFAULT_CTD.items():
                conn.execute(
                    """
                    INSERT INTO futures_ctd
                    (symbol, effective_date, cusip, coupon_pct, maturity, conversion_factor, source, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        sym,
                        today,
                        meta['cusip'],
                        meta['coupon_pct'],
                        meta['maturity'],
                        meta['conversion_factor'],
                        'seed',
                        now,
                    ),
                )
        conn.commit()


def upsert_daily(
    date_str: str,
    symbol: str,
    close_price: float,
    implied_yield: Optional[float],
    source: str = 'yfinance',
) -> None:
    init_futures_tables()
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO futures_daily (date, symbol, close_price, implied_yield, source, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(date, symbol) DO UPDATE SET
                close_price = excluded.close_price,
                implied_yield = excluded.implied_yield,
                source = excluded.source,
                fetched_at = excluded.fetched_at
            """,
            (date_str, symbol, close_price, implied_yield, source, now),
        )
        conn.commit()


def upsert_ctd(
    symbol: str,
    effective_date: str,
    cusip: str,
    coupon_pct: float,
    maturity: str,
    conversion_factor: float,
    source: str = 'manual',
) -> None:
    init_futures_tables()
    now = datetime.now(timezone.utc).isoformat()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO futures_ctd
            (symbol, effective_date, cusip, coupon_pct, maturity, conversion_factor, source, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol, effective_date) DO UPDATE SET
                cusip = excluded.cusip,
                coupon_pct = excluded.coupon_pct,
                maturity = excluded.maturity,
                conversion_factor = excluded.conversion_factor,
                source = excluded.source,
                fetched_at = excluded.fetched_at
            """,
            (symbol, effective_date, cusip, coupon_pct, maturity, conversion_factor, source, now),
        )
        conn.commit()


def latest_ctd(symbol: str, as_of: Optional[str] = None) -> Optional[CtdSpec]:
    init_futures_tables()
    as_of = as_of or datetime.now(timezone.utc).strftime('%Y-%m-%d')
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT * FROM futures_ctd
            WHERE symbol = ? AND effective_date <= ?
            ORDER BY effective_date DESC
            LIMIT 1
            """,
            (symbol, as_of),
        ).fetchone()
    if not row:
        meta = DEFAULT_CTD.get(symbol)
        if not meta:
            return None
        return CtdSpec(
            symbol=symbol,
            cusip=meta['cusip'],
            coupon_pct=meta['coupon_pct'],
            maturity=meta['maturity'],
            conversion_factor=meta['conversion_factor'],
            effective_date=as_of,
        )
    return CtdSpec(
        symbol=row['symbol'],
        cusip=row['cusip'],
        coupon_pct=row['coupon_pct'],
        maturity=row['maturity'],
        conversion_factor=row['conversion_factor'],
        effective_date=row['effective_date'],
        source=row['source'],
    )


def all_latest_ctd(as_of: Optional[str] = None) -> dict[str, CtdSpec]:
    symbols = list(DEFAULT_CTD.keys())
    return {s: spec for s in symbols if (spec := latest_ctd(s, as_of))}


def latest_prices(symbols: Optional[list[str]] = None) -> dict[str, dict[str, Any]]:
    init_futures_tables()
    symbols = symbols or list(DEFAULT_CTD.keys())
    placeholders = ','.join('?' * len(symbols))
    with _connect() as conn:
        rows = conn.execute(
            f"""
            SELECT f.* FROM futures_daily f
            INNER JOIN (
                SELECT symbol, MAX(date) AS max_date FROM futures_daily
                WHERE symbol IN ({placeholders})
                GROUP BY symbol
            ) latest ON f.symbol = latest.symbol AND f.date = latest.max_date
            """,
            symbols,
        ).fetchall()
    return {
        r['symbol']: {
            'date': r['date'],
            'close_price': r['close_price'],
            'implied_yield': r['implied_yield'],
            'source': r['source'],
        }
        for r in rows
    }


def history(
    start_date: str,
    end_date: str,
    symbols: Optional[list[str]] = None,
    field: str = 'implied_yield',
) -> dict[str, list[dict]]:
    init_futures_tables()
    symbols = symbols or list(DEFAULT_CTD.keys())
    col = 'implied_yield' if field == 'implied_yield' else 'close_price'
    placeholders = ','.join('?' * len(symbols))
    with _connect() as conn:
        rows = conn.execute(
            f"""
            SELECT date, symbol, {col} AS value, close_price, implied_yield
            FROM futures_daily
            WHERE date >= ? AND date <= ? AND symbol IN ({placeholders})
            ORDER BY date ASC
            """,
            [start_date, end_date, *symbols],
        ).fetchall()
    out: dict[str, list[dict]] = {s: [] for s in symbols}
    for r in rows:
        if r['value'] is None:
            continue
        out[r['symbol']].append(
            {
                'date': r['date'],
                'value': r['value'],
                'close_price': r['close_price'],
                'implied_yield': r['implied_yield'],
            }
        )
    return out


def ctd_snapshot() -> list[dict]:
    init_futures_tables()
    specs = all_latest_ctd()
    return [
        {
            'symbol': s,
            'cusip': spec.cusip,
            'coupon_pct': spec.coupon_pct,
            'maturity': spec.maturity,
            'conversion_factor': spec.conversion_factor,
            'effective_date': spec.effective_date,
            'source': spec.source,
        }
        for s, spec in sorted(specs.items())
    ]
