"""Polymarket Gamma API — FOMC rate decision markets."""
from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime
from typing import Any, Optional

import httpx

from .macro_calendar import FOMC_MEETING_DATES

logger = logging.getLogger(__name__)

GAMMA_BASE = 'https://gamma-api.polymarket.com'
POLYMARKET_EVENT_URL = 'https://polymarket.com/event/'


def _parse_date(value: str) -> date:
    return datetime.strptime(value, '%Y-%m-%d').date()


def upcoming_meetings(limit: int = 4, today: Optional[date] = None) -> list[date]:
    today = today or date.today()
    upcoming = sorted(d for d in (_parse_date(x) for x in FOMC_MEETING_DATES) if d >= today)
    return upcoming[:limit]


def _month_slug(d: date) -> str:
    return d.strftime('%B').lower()


def _normalize_outcome(question: str) -> Optional[str]:
    q = question.lower()
    if 'no change' in q or 'unchanged' in q or q.strip() == 'hold':
        return 'hold'
    if re.search(r'25\s*bp\s*(decrease|cut|lower)', q) or 'decrease 25' in q:
        return 'cut_25bp'
    if re.search(r'25\s*bp\s*(increase|hike|raise)', q) or 'increase 25' in q:
        return 'hike_25bp'
    if re.search(r'50\s*bp\s*(decrease|cut)', q):
        return 'cut_50bp'
    if re.search(r'50\s*bp\s*(increase|hike)', q):
        return 'hike_50bp'
    return None


def _parse_prices(raw: Any) -> list[float]:
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return []
    if not isinstance(raw, list):
        return []
    out: list[float] = []
    for x in raw:
        try:
            out.append(float(x))
        except (TypeError, ValueError):
            out.append(0.0)
    return out


def _probabilities_from_markets(markets: list[dict]) -> dict[str, float]:
    probs: dict[str, float] = {
        'cut_50bp': 0.0,
        'cut_25bp': 0.0,
        'hold': 0.0,
        'hike_25bp': 0.0,
        'hike_50bp': 0.0,
    }
    for m in markets:
        key = _normalize_outcome(m.get('question') or m.get('groupItemTitle') or '')
        if not key:
            continue
        prices = _parse_prices(m.get('outcomePrices'))
        if not prices:
            continue
        # First price is typically Yes probability
        probs[key] = max(probs.get(key, 0.0), prices[0])
    return probs


def _event_matches_meeting(event: dict, meeting: date) -> bool:
    title = (event.get('title') or '').lower()
    slug = (event.get('slug') or '').lower()
    month = _month_slug(meeting)
    year = str(meeting.year)
    if month in title and year in title:
        return True
    if month in slug and (year in slug or str(meeting.year)[2:] in slug):
        return True
    end = event.get('endDate') or event.get('end_date_iso') or ''
    if end.startswith(meeting.isoformat()):
        return True
    return False


async def search_fed_decision_event(meeting: date) -> Optional[dict[str, Any]]:
    """Find Polymarket event for a given FOMC meeting date."""
    month = _month_slug(meeting)
    queries = [
        f'fed decision {month} {meeting.year}',
        f'fomc {month} {meeting.year}',
        'fed decision',
    ]
    async with httpx.AsyncClient(timeout=25.0) as client:
        for q in queries:
            try:
                resp = await client.get(f'{GAMMA_BASE}/public-search', params={'q': q})
                resp.raise_for_status()
                events = resp.json().get('events') or []
                for ev in events:
                    if _event_matches_meeting(ev, meeting):
                        slug = ev.get('slug')
                        markets = ev.get('markets') or []
                        if not markets and slug:
                            detail = await client.get(f'{GAMMA_BASE}/events', params={'slug': slug})
                            if detail.status_code == 200:
                                rows = detail.json()
                                if isinstance(rows, list) and rows:
                                    markets = rows[0].get('markets') or []
                        probs = _probabilities_from_markets(markets)
                        if sum(probs.values()) <= 0:
                            continue
                        return {
                            'meeting_date': meeting.isoformat(),
                            'title': ev.get('title'),
                            'event_slug': slug,
                            'polymarket_url': f'{POLYMARKET_EVENT_URL}{slug}' if slug else None,
                            'probabilities': probs,
                            'markets_count': len(markets),
                        }
            except Exception as exc:
                logger.warning('Polymarket search failed for %s: %s', q, exc)
    return None


async def fetch_meeting_outlook(limit: int = 4) -> list[dict[str, Any]]:
    """Polymarket probabilities for the next N FOMC meetings."""
    outlook: list[dict[str, Any]] = []
    for meeting in upcoming_meetings(limit):
        row = await search_fed_decision_event(meeting)
        if row:
            outlook.append(row)
        else:
            outlook.append({
                'meeting_date': meeting.isoformat(),
                'title': f'FOMC {meeting.strftime("%b %Y")}',
                'event_slug': None,
                'polymarket_url': None,
                'probabilities': {'hold': 1.0, 'cut_25bp': 0.0, 'hike_25bp': 0.0},
                'markets_count': 0,
                'unavailable': True,
            })
    return outlook
