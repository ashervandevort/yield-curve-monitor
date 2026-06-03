#!/usr/bin/env python3
"""One-time migration: copy SQLite daily_curves into PostgreSQL yield_curve schema.

Run only when explicitly requested — not on every deploy:

  MIGRATE_SQLITE_TO_PG=1 python scripts/migrate_sqlite_to_pg.py
"""
from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / ".env")

from app.core.config import settings  # noqa: E402
from app.core.pg_curve_store import PostgresCurveStore  # noqa: E402


def main() -> None:
    if os.getenv("MIGRATE_SQLITE_TO_PG") != "1":
        print("Skip: steady-state deploy — set MIGRATE_SQLITE_TO_PG=1 for one-time SQLite→PG copy")
        return

    sqlite_path = Path(settings.SQLITE_CACHE_PATH)
    if not sqlite_path.exists():
        print(f"No SQLite file at {sqlite_path}")
        return

    pg = PostgresCurveStore()
    pg._ensure_db()

    existing = pg.row_count()
    if existing > 0:
        print(f"PostgreSQL already has {existing} rows — migration is idempotent but usually unnecessary.")

    conn = sqlite3.connect(sqlite_path)
    rows = conn.execute(
        "SELECT date, tenor, yield_pct, source FROM daily_curves ORDER BY date"
    ).fetchall()
    conn.close()

    if not rows:
        print("SQLite daily_curves is empty — nothing to migrate")
        return

    print(f"Migrating {len(rows)} rows from SQLite → PostgreSQL…")
    batch: dict[str, dict[str, float]] = {}
    for date, tenor, yield_pct, _source in rows:
        batch.setdefault(date, {})[tenor] = float(yield_pct)

    for date, yields in batch.items():
        pg.upsert_curve(date, yields)

    print(f"Done. PostgreSQL rows: {pg.row_count()}")


if __name__ == "__main__":
    main()

