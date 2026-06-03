"""FOMC meeting schedule, Polymarket odds, and FRED policy rate context."""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

import httpx

from .config import settings
from .fomc_store import fomc_store
from .fred_client import fred_client
from .macro_calendar import FOMC_MEETING_DATES
from .polymarket_client import fetch_meeting_outlook
from .futures_client import ff_implied_from_zq

ET = ZoneInfo('America/New_York')
FOMC_DECISION_HOUR = 14
POLYMARKET_CACHE_HOURS = 1


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
    """Latest observation via fred_client (retries on 429)."""
    if not settings.FRED_API_KEY:
        return None
    end = datetime.now().strftime('%Y-%m-%d')
    start = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    for attempt in range(3):
        try:
            df = await fred_client.fetch_series(series_id, start, end)
            if df.empty:
                return None
            val = df.iloc[-1]['value']
            if val is None or (isinstance(val, float) and val != val):
                return None
            return float(val)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429 and attempt < 2:
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            return None
        except Exception:
            return None
    return None


async def fetch_policy_rates() -> tuple[dict[str, Optional[float]], Optional[float]]:
    lower = await _fred_latest('DFEDTARL')
    await asyncio.sleep(0.3)
    upper = await _fred_latest('DFEDTARU')
    await asyncio.sleep(0.3)
    effective = await _fred_latest('DFF')
    target = {'lower': lower, 'upper': upper, 'midpoint': None}
    if lower is not None and upper is not None:
        target['midpoint'] = round((lower + upper) / 2, 4)
    return target, effective


def _compact_probs(raw: dict[str, float]) -> dict[str, float]:
    return {
        'cut_25bp': round(raw.get('cut_25bp', 0) + raw.get('cut_50bp', 0) * 0.5, 4),
        'hold': round(raw.get('hold', 0), 4),
        'hike_25bp': round(raw.get('hike_25bp', 0) + raw.get('hike_50bp', 0) * 0.5, 4),
        'cut_50bp': round(raw.get('cut_50bp', 0), 4),
        'hike_50bp': round(raw.get('hike_50bp', 0), 4),
    }


def _cache_age_hours(row: dict[str, Any]) -> float:
    fetched = row.get('fetched_at')
    if not fetched:
        return 999.0
    try:
        ts = datetime.fromisoformat(fetched)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - ts).total_seconds() / 3600
    except Exception:
        return 999.0


async def build_fomc_snapshot(refresh: bool = False) -> dict[str, Any]:
    meeting = next_fomc_meeting()
    if not meeting:
        return {'next_meeting': None, 'meetings': list(FOMC_MEETING_DATES)}

    cached = fomc_store.latest_snapshot(meeting['date'])
    target, effective = await fetch_policy_rates()

    try:
        zq_implied = ff_implied_from_zq()
    except Exception:
        zq_implied = cached.get('zq_implied') if cached else None

    implied = zq_implied if zq_implied is not None else effective

    poly_fresh = (
        refresh
        or not cached
        or cached.get('source') != 'polymarket'
        or _cache_age_hours(cached) >= POLYMARKET_CACHE_HOURS
    )

    if poly_fresh:
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
        else:
            probabilities = cached.get('probabilities') if cached else {'hold': 1.0, 'cut_25bp': 0.0, 'hike_25bp': 0.0}
            source = cached.get('source', 'unavailable') if cached else 'unavailable'
            poly_url = cached.get('polymarket_url') if cached else None
            event_slug = cached.get('event_slug') if cached else None
            outlook = outlook or (cached.get('meeting_outlook') if cached else [])

        if source == 'polymarket' or refresh:
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
            cached = fomc_store.latest_snapshot(meeting['date']) or cached

    row = dict(cached or {})
    row['target_lower'] = target.get('lower') if target.get('lower') is not None else row.get('target_lower')
    row['target_upper'] = target.get('upper') if target.get('upper') is not None else row.get('target_upper')
    row['effective_rate'] = effective if effective is not None else row.get('effective_rate')
    row['implied_rate'] = implied
    row['zq_implied'] = zq_implied

    return _snapshot_response(meeting, row)


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
