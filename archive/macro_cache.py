"""SQLite cache for macro calendar API payloads."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .config import settings


class MacroCalendarCache:
    def __init__(self, db_path: str | None = None) -> None:
        configured = db_path or settings.SQLITE_CACHE_PATH
        self.db_path = Path(configured)
        self._initialized = False

    def _connect(self) -> sqlite3.Connection:
        self._ensure_db()
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_db(self) -> None:
        if self._initialized:
            return
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS macro_calendar_cache (
                    cache_key TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    fetched_at TEXT NOT NULL
                )
                """
            )
        self._initialized = True

    def get(self, cache_key: str) -> Optional[dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                'SELECT payload_json, fetched_at FROM macro_calendar_cache WHERE cache_key = ?',
                (cache_key,),
            ).fetchone()
        if not row:
            return None
        payload = json.loads(row['payload_json'])
        payload['_fetched_at'] = row['fetched_at']
        return payload

    def set(self, cache_key: str, payload: dict[str, Any]) -> str:
        fetched_at = datetime.now(timezone.utc).isoformat()
        body = {k: v for k, v in payload.items() if not k.startswith('_')}
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO macro_calendar_cache (cache_key, payload_json, fetched_at)
                VALUES (?, ?, ?)
                ON CONFLICT(cache_key) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    fetched_at = excluded.fetched_at
                """,
                (cache_key, json.dumps(body), fetched_at),
            )
        return fetched_at

    @staticmethod
    def age_hours(fetched_at: str) -> Optional[float]:
        try:
            fetched = datetime.fromisoformat(fetched_at)
            if fetched.tzinfo is None:
                fetched = fetched.replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - fetched).total_seconds() / 3600
        except ValueError:
            return None


macro_cache = MacroCalendarCache()
