"""PostgreSQL-backed yield curve store (shared VPS DB, yield_curve schema)."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Iterable

import pandas as pd
import psycopg2
import psycopg2.extras

from .config import settings
from .curve_store import StoredCurve


class PostgresCurveStore:
    """Persist curve snapshots in PostgreSQL — same pattern as Market Color daily_prices."""

    SCHEMA = "yield_curve"

    def __init__(self) -> None:
        self._initialized = False

    def _connect(self):
        return psycopg2.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            dbname=settings.DB_NAME,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
        )

    def _ensure_db(self) -> None:
        if self._initialized:
            return
        with self._connect() as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute(f"CREATE SCHEMA IF NOT EXISTS {self.SCHEMA}")
                cur.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {self.SCHEMA}.daily_curves (
                        date DATE NOT NULL,
                        tenor VARCHAR(10) NOT NULL,
                        yield_pct DOUBLE PRECISION NOT NULL,
                        source VARCHAR(20) NOT NULL DEFAULT 'FRED',
                        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        PRIMARY KEY (date, tenor)
                    )
                    """
                )
                cur.execute(
                    f"""
                    CREATE INDEX IF NOT EXISTS idx_yc_daily_curves_date
                    ON {self.SCHEMA}.daily_curves (date DESC)
                    """
                )
                cur.execute(
                    f"""
                    CREATE INDEX IF NOT EXISTS idx_yc_daily_curves_tenor_date
                    ON {self.SCHEMA}.daily_curves (tenor, date DESC)
                    """
                )
        self._initialized = True

    def upsert_curve(self, date: str, yields: dict[str, float], source: str = "FRED") -> StoredCurve:
        self._ensure_db()
        fetched_at = datetime.now(timezone.utc)
        rows = [(date, tenor, float(value), source, fetched_at) for tenor, value in yields.items()]
        with self._connect() as conn:
            with conn.cursor() as cur:
                psycopg2.extras.execute_values(
                    cur,
                    f"""
                    INSERT INTO {self.SCHEMA}.daily_curves (date, tenor, yield_pct, source, fetched_at)
                    VALUES %s
                    ON CONFLICT (date, tenor) DO UPDATE SET
                        yield_pct = EXCLUDED.yield_pct,
                        source = EXCLUDED.source,
                        fetched_at = EXCLUDED.fetched_at
                    """,
                    rows,
                )
            conn.commit()
        return StoredCurve(
            date=date,
            yields=yields,
            source=source,
            fetched_at=fetched_at.isoformat(),
        )

    def latest_complete_curve(self, tenors: Iterable[str]) -> StoredCurve | None:
        tenor_list = list(tenors)
        if not tenor_list:
            return None
        self._ensure_db()
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    f"""
                    SELECT date, MAX(fetched_at) AS fetched_at
                    FROM {self.SCHEMA}.daily_curves
                    WHERE tenor = ANY(%s)
                    GROUP BY date
                    HAVING COUNT(DISTINCT tenor) = %s
                    ORDER BY date DESC
                    LIMIT 1
                    """,
                    (tenor_list, len(tenor_list)),
                )
                row = cur.fetchone()
                if not row:
                    return None
                date_str = row["date"].strftime("%Y-%m-%d") if hasattr(row["date"], "strftime") else str(row["date"])
                cur.execute(
                    f"""
                    SELECT tenor, yield_pct, source, fetched_at
                    FROM {self.SCHEMA}.daily_curves
                    WHERE date = %s AND tenor = ANY(%s)
                    """,
                    (date_str, tenor_list),
                )
                rows = cur.fetchall()
        if not rows:
            return None
        yields = {row["tenor"]: float(row["yield_pct"]) for row in rows}
        return StoredCurve(
            date=date_str,
            yields=yields,
            source=rows[0]["source"],
            fetched_at=max(row["fetched_at"].isoformat() for row in rows),
        )

    def latest_curve(self, tenors: Iterable[str]) -> StoredCurve | None:
        complete = self.latest_complete_curve(tenors)
        if complete:
            return complete
        tenor_list = list(tenors)
        if not tenor_list:
            return None
        self._ensure_db()
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    f"""
                    SELECT DISTINCT ON (tenor)
                        tenor, yield_pct, source, fetched_at, date
                    FROM {self.SCHEMA}.daily_curves
                    WHERE tenor = ANY(%s)
                    ORDER BY tenor, date DESC
                    """,
                    (tenor_list,),
                )
                rows = cur.fetchall()
        if not rows:
            return None
        yields = {row["tenor"]: float(row["yield_pct"]) for row in rows}
        date_counts: Counter[str] = Counter(str(row["date"]) for row in rows)
        best_date = date_counts.most_common(1)[0][0]
        return StoredCurve(
            date=best_date,
            yields=yields,
            source=rows[0]["source"],
            fetched_at=max(row["fetched_at"].isoformat() for row in rows),
        )

    def curve_history(self, start_date: str, end_date: str, tenors: Iterable[str]) -> pd.DataFrame:
        tenor_list = list(tenors)
        if not tenor_list:
            return pd.DataFrame()
        self._ensure_db()
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    f"""
                    SELECT date, tenor, yield_pct
                    FROM {self.SCHEMA}.daily_curves
                    WHERE date BETWEEN %s AND %s AND tenor = ANY(%s)
                    ORDER BY date ASC
                    """,
                    (start_date, end_date, tenor_list),
                )
                rows = cur.fetchall()
        if not rows:
            return pd.DataFrame()
        frame = pd.DataFrame(rows)
        frame["date"] = pd.to_datetime(frame["date"])
        pivot = frame.pivot(index="date", columns="tenor", values="yield_pct")
        return pivot.sort_index()

    def max_stored_date(self) -> str | None:
        """Return the latest calendar date present in storage, or None if empty."""
        self._ensure_db()
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT MAX(date) FROM {self.SCHEMA}.daily_curves")
                row = cur.fetchone()
        if not row or row[0] is None:
            return None
        return row[0].strftime("%Y-%m-%d") if hasattr(row[0], "strftime") else str(row[0])

    def row_count(self) -> int:
        self._ensure_db()
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT COUNT(*) FROM {self.SCHEMA}.daily_curves")
                return int(cur.fetchone()[0])
