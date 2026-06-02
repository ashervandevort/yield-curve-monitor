"""FOMC meeting schedule, Polymarket odds, and FRED policy rate context."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

import httpx

from .config import settings
from .fomc_store import fomc_store
from .macro_calendar import FOMC_MEETING_DATES
from .polymarket_client import fetch_meeting_outlook
from .futures_client import ff_implied_from_zq

ET = ZoneInfo('America/New_York')
FOMC_DECISION_HOUR = 14


def _parse_date(value: str) -> date:
    return datetime.strptime(value, '%Y-%m-%d').date()


def next_fomc_meeting(today: Optional[date] = None) -> Optional[dict[str, Any]]:
    today = today or datetime.now(ET).date()
    upcoming = sorted(d for d in (_parse_date(x) for x in FOMC_MEETING_DATES) if d >= today)
    if not upcoming:
        return None
    meeting = upcoming[0]
    decision_at = datetime(
        meeting.year, meeting.month, meeting.day, FOMC_DECISION_HOUR, 0, 0, tzinfo=ET
    )
    return {
        'date': meeting.isoformat(),
        'day_of_week': meeting.strftime('%a'),
        'decision_at_et': decision_at.isoformat(),
        'decision_at_utc': decision_at.astimezone(timezone.utc).isoformat(),
    }


def countdown_to_meeting(meeting: dict[str, Any]) -> dict[str, int]:
    target = datetime.fromisoformat(meeting['decision_at_utc'])
    if target.tzinfo is None:
        target = target.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    delta = max(timedelta(0), target - now)
    total_seconds = int(delta.total_seconds())
    days, rem = divmod(total_seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, seconds = divmod(rem, 60)
    return {'days': days, 'hours': hours, 'minutes': minutes, 'seconds': seconds}


async def _fred_latest(series_id: str) -> Optional[float]:
    if not settings.FRED_API_KEY:
        return None
    url = f'{settings.FRED_BASE_URL}/series/observations'
    params = {
        'series_id': series_id,
        'api_key': settings.FRED_API_KEY,
        'file_type': 'json',
        'sort_order': 'desc',
        'limit': 1,
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        obs = resp.json().get('observations') or []
        if not obs:
            return None
        val = obs[0].get('value')
        if val in (None, '.', ''):
            return None
        return float(val)


async def fetch_target_range() -> dict[str, Optional[float]]:
    lower = await _fred_latest('DFEDTARL')
    upper = await _fred_latest('DFEDTARU')
    midpoint = None
    if lower is not None and upper is not None:
        midpoint = round((lower + upper) / 2, 4)
    return {'lower': lower, 'upper': upper, 'midpoint': midpoint}


def _compact_probs(raw: dict[str, float]) -> dict[str, float]:
    """Normalize to primary buckets for UI."""
    return {
        'cut_25bp': round(raw.get('cut_25bp', 0) + raw.get('cut_50bp', 0) * 0.5, 4),
        'hold': round(raw.get('hold', 0), 4),
        'hike_25bp': round(raw.get('hike_25bp', 0) + raw.get('hike_50bp', 0) * 0.5, 4),
        'cut_50bp': round(raw.get('cut_50bp', 0), 4),
        'hike_50bp': round(raw.get('hike_50bp', 0), 4),
    }


async def build_fomc_snapshot(refresh: bool = False) -> dict[str, Any]:
    meeting = next_fomc_meeting()
    if not meeting:
        return {'next_meeting': None, 'meetings': list(FOMC_MEETING_DATES)}

    cached = fomc_store.latest_snapshot(meeting['date'])
    if cached and not refresh:
        return _snapshot_response(meeting, cached)

    try:
        target = await fetch_target_range()
        effective = await _fred_latest('DFF')
    except Exception:
        target = {'lower': None, 'upper': None, 'midpoint': None}
        effective = cached.get('implied_rate') if cached else None

    try:
        zq_implied = ff_implied_from_zq()
    except Exception:
        zq_implied = None

    implied = zq_implied if zq_implied is not None else effective

    try:
        outlook = await fetch_meeting_outlook(limit=4)
    except Exception:
        outlook = cached.get('meeting_outlook') if cached else []

    next_poly = next((m for m in outlook if m.get('meeting_date') == meeting['date']), None)
    if next_poly and not next_poly.get('unavailable'):
        probabilities = _compact_probs(next_poly['probabilities'])
        source = 'polymarket'
        poly_url = next_poly.get('polymarket_url')
        event_slug = next_poly.get('event_slug')
        note = 'Market-implied odds from Polymarket. Not investment advice.'
    else:
        probabilities = {'hold': 1.0, 'cut_25bp': 0.0, 'hike_25bp': 0.0}
        source = 'unavailable'
        poly_url = None
        event_slug = None
        note = 'Polymarket market not matched — refresh later or check event slug.'

    fomc_store.upsert_snapshot(
        meeting['date'],
        source,
        probabilities,
        target_lower=target.get('lower'),
        target_upper=target.get('upper'),
        implied_rate=implied,
        effective_rate=effective,
        polymarket_url=poly_url,
        event_slug=event_slug,
        meeting_outlook=outlook,
        zq_implied=zq_implied,
    )

    row = fomc_store.latest_snapshot(meeting['date'])
    return _snapshot_response(meeting, row or {})


def _snapshot_response(meeting: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    target = {
        'lower': row.get('target_lower'),
        'upper': row.get('target_upper'),
        'midpoint': (
            round((row['target_lower'] + row['target_upper']) / 2, 4)
            if row.get('target_lower') is not None and row.get('target_upper') is not None
            else None
        ),
    }
    source = row.get('source', 'unknown')
    note = (
        'Market-implied odds from Polymarket. Not investment advice.'
        if source == 'polymarket'
        else row.get('probability_note') or 'Odds unavailable.'
    )
    return {
        'next_meeting': meeting,
        'countdown': countdown_to_meeting(meeting),
        'target_range': target,
        'effective_rate': row.get('effective_rate'),
        'implied_rate': row.get('implied_rate'),
        'zq_implied': row.get('zq_implied'),
        'probabilities': row.get('probabilities') or {'hold': 1.0, 'cut_25bp': 0.0, 'hike_25bp': 0.0},
        'probability_source': source,
        'probability_note': note,
        'polymarket_url': row.get('polymarket_url'),
        'event_slug': row.get('event_slug'),
        'meeting_outlook': row.get('meeting_outlook') or [],
        'meetings': list(FOMC_MEETING_DATES),
    }
