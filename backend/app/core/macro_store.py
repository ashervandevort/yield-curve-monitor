"""Persistent SQLite store for macro release dates (FRED + scheduled)."""
from __future__ import annotations

import csv
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .config import settings


class MacroStore:
    """Append/update release dates per indicator — avoids repeated FRED pulls."""

    def __init__(self, db_path: str | None = None) -> None:
        configured = db_path or settings.SQLITE_CACHE_PATH
        self.db_path = Path(configured)
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
                CREATE TABLE IF NOT EXISTS macro_release_dates (
                    release_key TEXT NOT NULL,
                    release_date TEXT NOT NULL,
                    source TEXT NOT NULL,
                    fetched_at TEXT NOT NULL,
                    PRIMARY KEY (release_key, release_date)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS macro_sync_meta (
                    release_key TEXT PRIMARY KEY,
                    last_sync_at TEXT NOT NULL,
                    last_fred_date TEXT,
                    row_count INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            conn.execute(
                'CREATE INDEX IF NOT EXISTS idx_macro_release_date ON macro_release_dates(release_date)'
            )
        self._initialized = True

    def upsert_dates(
        self,
        release_key: str,
        dates: list[str],
        source: str,
    ) -> int:
        if not dates:
            return 0
        fetched_at = datetime.now(timezone.utc).isoformat()
        rows = [(release_key, d, source, fetched_at) for d in sorted(set(dates))]
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO macro_release_dates (release_key, release_date, source, fetched_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(release_key, release_date) DO UPDATE SET
                    source = excluded.source,
                    fetched_at = excluded.fetched_at
                """,
                rows,
            )
        return len(rows)

    def get_dates(
        self,
        release_key: str,
        start_date: str,
        end_date: str,
    ) -> list[str]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT release_date FROM macro_release_dates
                WHERE release_key = ? AND release_date >= ? AND release_date <= ?
                ORDER BY release_date
                """,
                (release_key, start_date, end_date),
            ).fetchall()
        return [row['release_date'] for row in rows]

    def resolve_dates_for_calendar(
        self,
        release_key: str,
        start_date: str,
        end_date: str,
    ) -> list[str]:
        """One date per month; prefer FRED over scheduled when both exist."""
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT release_date, source FROM macro_release_dates
                WHERE release_key = ? AND release_date >= ? AND release_date <= ?
                ORDER BY release_date
                """,
                (release_key, start_date, end_date),
            ).fetchall()

        source_rank = {'fred': 0, 'fomc': 0, 'scheduled': 1}
        by_month: dict[str, sqlite3.Row] = {}
        for row in rows:
            ym = row['release_date'][:7]
            cur = by_month.get(ym)
            if cur is None:
                by_month[ym] = row
                continue
            cur_rank = source_rank.get(cur['source'], 2)
            new_rank = source_rank.get(row['source'], 2)
            if new_rank < cur_rank:
                by_month[ym] = row
            elif new_rank == cur_rank and row['release_date'] < cur['release_date']:
                by_month[ym] = row

        return sorted(r['release_date'] for r in by_month.values())

    def prune_past_scheduled(self) -> int:
        """Drop stale scheduled rows in the past (published FRED rows are kept)."""
        today = datetime.now(timezone.utc).date().isoformat()
        with self._connect() as conn:
            cur = conn.execute(
                """
                DELETE FROM macro_release_dates
                WHERE source = 'scheduled' AND release_date < ?
                """,
                (today,),
            )
            return cur.rowcount

    def get_source(self, release_key: str, release_date: str) -> Optional[str]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT source FROM macro_release_dates
                WHERE release_key = ? AND release_date = ?
                """,
                (release_key, release_date),
            ).fetchone()
        return row['source'] if row else None

    def max_fred_date(self, release_key: str) -> Optional[str]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT MAX(release_date) AS max_date FROM macro_release_dates
                WHERE release_key = ? AND source = 'fred'
                """,
                (release_key,),
            ).fetchone()
        return row['max_date'] if row and row['max_date'] else None

    def last_sync_at(self, release_key: str) -> Optional[str]:
        with self._connect() as conn:
            row = conn.execute(
                'SELECT last_sync_at FROM macro_sync_meta WHERE release_key = ?',
                (release_key,),
            ).fetchone()
        return row['last_sync_at'] if row else None

    def set_sync_meta(self, release_key: str, last_fred_date: str | None = None) -> None:
        fetched_at = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            count = conn.execute(
                'SELECT COUNT(*) AS n FROM macro_release_dates WHERE release_key = ?',
                (release_key,),
            ).fetchone()['n']
            conn.execute(
                """
                INSERT INTO macro_sync_meta (release_key, last_sync_at, last_fred_date, row_count)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(release_key) DO UPDATE SET
                    last_sync_at = excluded.last_sync_at,
                    last_fred_date = COALESCE(excluded.last_fred_date, macro_sync_meta.last_fred_date),
                    row_count = excluded.row_count
                """,
                (release_key, fetched_at, last_fred_date, count),
            )

    def sync_age_hours(self, release_key: str) -> Optional[float]:
        last = self.last_sync_at(release_key)
        if not last:
            return None
        try:
            synced = datetime.fromisoformat(last)
            if synced.tzinfo is None:
                synced = synced.replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - synced).total_seconds() / 3600
        except ValueError:
            return None

    def row_count(self, release_key: str | None = None) -> int:
        with self._connect() as conn:
            if release_key:
                row = conn.execute(
                    'SELECT COUNT(*) AS n FROM macro_release_dates WHERE release_key = ?',
                    (release_key,),
                ).fetchone()
            else:
                row = conn.execute('SELECT COUNT(*) AS n FROM macro_release_dates').fetchone()
        return int(row['n'])

    def export_csv(self, csv_path: str | Path | None = None) -> Path:
        """Mirror stored dates to CSV for backup / inspection."""
        out = Path(csv_path or self.db_path.parent / 'macro_release_dates.csv')
        out.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT release_key, release_date, source, fetched_at
                FROM macro_release_dates
                ORDER BY release_date, release_key
                """
            ).fetchall()
        with out.open('w', newline='', encoding='utf-8') as fh:
            writer = csv.writer(fh)
            writer.writerow(['release_key', 'release_date', 'source', 'fetched_at'])
            for row in rows:
                writer.writerow([row['release_key'], row['release_date'], row['source'], row['fetched_at']])
        return out


macro_store = MacroStore()
