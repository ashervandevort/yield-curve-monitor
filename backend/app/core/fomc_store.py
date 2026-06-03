"""SQLite persistence for FOMC meeting probability snapshots."""
from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from .config import settings


class FomcStore:
    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or settings.SQLITE_CACHE_PATH
        self._ensure_db()

    def _connect(self) -> sqlite3.Connection:
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS fomc_probability_snapshots (
                    meeting_date TEXT NOT NULL,
                    fetched_at TEXT NOT NULL,
                    source TEXT NOT NULL,
                    target_lower REAL,
                    target_upper REAL,
                    implied_rate REAL,
                    effective_rate REAL,
                    zq_implied REAL,
                    polymarket_url TEXT,
                    event_slug TEXT,
                    probabilities_json TEXT NOT NULL,
                    meeting_outlook_json TEXT,
                    PRIMARY KEY (meeting_date, fetched_at)
                );
                CREATE INDEX IF NOT EXISTS idx_fomc_snap_meeting
                    ON fomc_probability_snapshots(meeting_date);
                """
            )
            cols = {r[1] for r in conn.execute('PRAGMA table_info(fomc_probability_snapshots)')}
            migrations = {
                'effective_rate': 'ALTER TABLE fomc_probability_snapshots ADD COLUMN effective_rate REAL',
                'zq_implied': 'ALTER TABLE fomc_probability_snapshots ADD COLUMN zq_implied REAL',
                'polymarket_url': 'ALTER TABLE fomc_probability_snapshots ADD COLUMN polymarket_url TEXT',
                'event_slug': 'ALTER TABLE fomc_probability_snapshots ADD COLUMN event_slug TEXT',
                'meeting_outlook_json': 'ALTER TABLE fomc_probability_snapshots ADD COLUMN meeting_outlook_json TEXT',
            }
            for col, sql in migrations.items():
                if col not in cols:
                    conn.execute(sql)

    def upsert_snapshot(
        self,
        meeting_date: str,
        source: str,
        probabilities: dict[str, float],
        *,
        target_lower: Optional[float] = None,
        target_upper: Optional[float] = None,
        implied_rate: Optional[float] = None,
        effective_rate: Optional[float] = None,
        zq_implied: Optional[float] = None,
        polymarket_url: Optional[str] = None,
        event_slug: Optional[str] = None,
        meeting_outlook: Optional[list[dict]] = None,
    ) -> None:
        fetched_at = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO fomc_probability_snapshots (
                    meeting_date, fetched_at, source,
                    target_lower, target_upper, implied_rate, effective_rate, zq_implied,
                    polymarket_url, event_slug,
                    probabilities_json, meeting_outlook_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    meeting_date,
                    fetched_at,
                    source,
                    target_lower,
                    target_upper,
                    implied_rate,
                    effective_rate,
                    zq_implied,
                    polymarket_url,
                    event_slug,
                    json.dumps(probabilities),
                    json.dumps(meeting_outlook or []),
                ),
            )

    def latest_snapshot(self, meeting_date: str) -> Optional[dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM fomc_probability_snapshots
                WHERE meeting_date = ?
                ORDER BY fetched_at DESC
                LIMIT 1
                """,
                (meeting_date,),
            ).fetchone()
        if not row:
            return None
        out = dict(row)
        out['probabilities'] = json.loads(out['probabilities_json'])
        out['meeting_outlook'] = json.loads(out.get('meeting_outlook_json') or '[]')
        del out['probabilities_json']
        if 'meeting_outlook_json' in out:
            del out['meeting_outlook_json']
        return out

    def prior_probabilities(
        self,
        meeting_date: str,
        hours: float = 24,
    ) -> Optional[dict[str, float]]:
        """Probabilities from the latest snapshot at least `hours` ago."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT probabilities_json FROM fomc_probability_snapshots
                WHERE meeting_date = ? AND fetched_at <= ?
                ORDER BY fetched_at DESC
                LIMIT 1
                """,
                (meeting_date, cutoff.isoformat()),
            ).fetchone()
        if not row:
            return None
        return json.loads(row['probabilities_json'])

    def probability_deltas(
        self,
        meeting_date: str,
        current: dict[str, float],
        hours: float = 24,
    ) -> dict[str, float]:
        prior = self.prior_probabilities(meeting_date, hours)
        if not prior:
            return {}
        keys = ('cut_25bp', 'hold', 'hike_25bp')
        return {
            k: round((current.get(k, 0) - prior.get(k, 0)) * 100, 1)
            for k in keys
        }


fomc_store = FomcStore()
