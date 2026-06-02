"""FOMC + Polymarket + futures cron jobs."""
from __future__ import annotations

import asyncio
import sys
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv

load_dotenv(BACKEND_ROOT / '.env')
load_dotenv(BACKEND_ROOT.parent / '.env')

from app.core.fomc_client import build_fomc_snapshot  # noqa: E402


async def run() -> None:
    print(f'[{datetime.now().isoformat()}] FOMC + Polymarket sync')
    snap = await build_fomc_snapshot(refresh=True)
    n = len(snap.get('meeting_outlook') or [])
    print(f'  Meetings in outlook: {n}')
    print(f'  Next: {snap.get("next_meeting", {}).get("date")}')
    print('Done.')


if __name__ == '__main__':
    asyncio.run(run())
