"""SQLite-backed yield curve snapshot store."""
from __future__ import annotations

import sqlite3
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import pandas as pd

from .config import settings


@dataclass(frozen=True)
class StoredCurve:
    """A persisted curve snapshot."""

    date: str
    yields: dict[str, float]
    source: str
    fetched_at: str


class CurveStore:
    """Small local persistence layer for reproducible curve reads."""

    def __init__(self, db_path: str | None = None):
        configured_path = db_path or settings.SQLITE_CACHE_PATH
        self.db_path = Path(configured_path)
        self._initialized = False

    def _raw_connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _connect(self) -> sqlite3.Connection:
        self._ensure_db()
        return self._raw_connect()

    def _ensure_db(self) -> None:
        if self._initialized:
            return

        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._raw_connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS daily_curves (
                    date TEXT NOT NULL,
                    tenor TEXT NOT NULL,
                    yield_pct REAL NOT NULL,
                    source TEXT NOT NULL DEFAULT 'FRED',
                    fetched_at TEXT NOT NULL,
                    PRIMARY KEY (date, tenor)
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_daily_curves_date ON daily_curves(date)"
            )
        self._initialized = True

    def upsert_curve(self, date: str, yields: dict[str, float], source: str = "FRED") -> StoredCurve:
        fetched_at = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO daily_curves (date, tenor, yield_pct, source, fetched_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(date, tenor)
                DO UPDATE SET
                    yield_pct = excluded.yield_pct,
                    source = excluded.source,
                    fetched_at = excluded.fetched_at
                """,
                [
                    (date, tenor, float(value), source, fetched_at)
                    for tenor, value in yields.items()
                ],
            )
        return StoredCurve(date=date, yields=yields, source=source, fetched_at=fetched_at)

    def latest_curve(self, tenors: Iterable[str]) -> StoredCurve | None:
        """
        Return the most recent available value for each requested tenor.

        Critically, each tenor is looked up independently (MAX(date) per tenor)
        so that a single series having a newer publication date does NOT cause
        all other tenors to appear missing.
        """
        tenor_list = list(tenors)
        if not tenor_list:
            return None

        placeholders = ",".join("?" for _ in tenor_list)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT tenor, yield_pct, source, fetched_at, MAX(date) AS date
                FROM daily_curves
                WHERE tenor IN ({placeholders})
                GROUP BY tenor
                """,
                tenor_list,
            ).fetchall()

        if not rows:
            return None

        yields = {row["tenor"]: float(row["yield_pct"]) for row in rows}

        # Curve date = most frequent date across tenors (modal date)
        date_counts: Counter[str] = Counter(row["date"] for row in rows if row["date"])
        best_date = date_counts.most_common(1)[0][0] if date_counts else rows[0]["date"]

        return StoredCurve(
            date=best_date,
            yields=yields,
            source=rows[0]["source"],
            fetched_at=max(row["fetched_at"] for row in rows),
        )

    def curve_history(self, start_date: str, end_date: str, tenors: Iterable[str]) -> pd.DataFrame:
        tenor_list = list(tenors)
        if not tenor_list:
            return pd.DataFrame()

        placeholders = ",".join("?" for _ in tenor_list)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT date, tenor, yield_pct
                FROM daily_curves
                WHERE date BETWEEN ? AND ? AND tenor IN ({placeholders})
                ORDER BY date ASC
                """,
                [start_date, end_date, *tenor_list],
            ).fetchall()

        if not rows:
            return pd.DataFrame()

        frame = pd.DataFrame([dict(row) for row in rows])
        pivot = frame.pivot(index="date", columns="tenor", values="yield_pct")
        pivot.index = pd.to_datetime(pivot.index)
        return pivot.sort_index()


curve_store = CurveStore()
