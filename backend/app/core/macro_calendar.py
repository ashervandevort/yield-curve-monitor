"""FRED macro release calendar for key economic indicators."""
from __future__ import annotations

import asyncio
from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Any

import httpx

from .config import settings
from .macro_store import macro_store
from .market_calendar import market_by_date, market_days_in_range

MIN_RELEASE_GAP_DAYS = 7
MACRO_SYNC_MAX_AGE_HOURS = settings.MACRO_SYNC_MAX_AGE_HOURS
FRED_OVERLAP_DAYS = 5
FRED_BOOTSTRAP_DAYS = 90
SCHEDULED_HORIZON_DAYS = 120

# Verified via FRED /release — stable release IDs
MACRO_RELEASES: dict[str, dict[str, Any]] = {
    'fomc': {
        'release_id': 101,
        'name': 'FOMC Press Release',
        'category': 'monetary_policy',
        'release_time_et': '14:00',
    },
    'cpi': {
        'release_id': 10,
        'name': 'Consumer Price Index',
        'category': 'inflation',
        'release_time_et': '08:30',
    },
    'employment': {
        'release_id': 50,
        'name': 'Employment Situation',
        'category': 'labor',
        'release_time_et': '08:30',
    },
    'ppi': {
        'release_id': 46,
        'name': 'Producer Price Index',
        'category': 'inflation',
        'release_time_et': '08:30',
    },
    'gdp': {
        'release_id': 53,
        'name': 'Gross Domestic Product',
        'category': 'growth',
        'release_time_et': '08:30',
    },
}

# FOMC statement dates (Fed calendar) — FRED release/dates returns noisy revision vintages
FOMC_MEETING_DATES: tuple[str, ...] = (
    '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30',
    '2025-09-17', '2025-10-29', '2025-12-10',
    '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29',
    '2026-09-16', '2026-10-28', '2026-12-09',
)


def _parse_date(value: str) -> date:
    return datetime.strptime(value, '%Y-%m-%d').date()


def _format_time_et(hhmm: str) -> str:
    hour, minute = hhmm.split(':')
    h = int(hour)
    suffix = 'AM' if h < 12 else 'PM'
    display = h % 12 or 12
    return f'{display}:{minute} {suffix} ET'


def _weekday_label(d: date) -> str:
    return d.strftime('%a')


def _event_fields(release_key: str, meta: dict[str, Any], date_str: str, source: str) -> dict[str, Any]:
    d = _parse_date(date_str)
    time_et = meta.get('release_time_et', '08:30')
    return {
        'date': date_str,
        'release_key': release_key,
        'release_id': meta['release_id'],
        'name': meta['name'],
        'category': meta['category'],
        'source': source,
        'day_of_week': _weekday_label(d),
        'release_time_et': time_et,
        'release_time_label': _format_time_et(time_et),
    }


def _dedupe_release_dates(
    dates: list[str],
    *,
    min_gap_days: int = MIN_RELEASE_GAP_DAYS,
) -> list[str]:
    if not dates:
        return []
    sorted_dates = sorted(set(dates))
    kept = [sorted_dates[0]]
    for date_str in sorted_dates[1:]:
        prev = _parse_date(kept[-1])
        cur = _parse_date(date_str)
        if (cur - prev).days >= min_gap_days:
            kept.append(date_str)
    return kept


def _cap_one_per_month(dates: list[str]) -> list[str]:
    """At most one release date per calendar month (drops FRED revision clusters)."""
    seen: set[tuple[int, int]] = set()
    kept: list[str] = []
    for date_str in sorted(dates):
        d = _parse_date(date_str)
        key = (d.year, d.month)
        if key in seen:
            continue
        seen.add(key)
        kept.append(date_str)
    return kept


def _first_friday(year: int, month: int) -> date:
    d = date(year, month, 1)
    while d.weekday() != 4:
        d += timedelta(days=1)
    return d


def _business_day_on_or_after(year: int, month: int, day: int) -> date:
    last = monthrange(year, month)[1]
    d = date(year, month, min(day, last))
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def _gdp_release_day(year: int, month: int) -> date | None:
    """BEA advance GDP: Jan, Apr, Jul, Oct — typically last week of month."""
    if month not in (1, 4, 7, 10):
        return None
    last = monthrange(year, month)[1]
    d = date(year, month, last)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d


def _scheduled_dates_for_release(release_key: str, start: date, end: date) -> list[str]:
    """Rule-based upcoming release estimates (used only for future dates)."""
    out: list[str] = []
    if release_key == 'fomc':
        for raw in FOMC_MEETING_DATES:
            d = _parse_date(raw)
            if start <= d <= end:
                out.append(raw)
        return out

    y, m = start.year, start.month
    end_y, end_m = end.year, end.month
    while (y, m) <= (end_y, end_m):
        candidate: date | None = None
        if release_key == 'employment':
            candidate = _first_friday(y, m)
        elif release_key == 'cpi':
            candidate = _business_day_on_or_after(y, m, 12)
        elif release_key == 'ppi':
            candidate = _business_day_on_or_after(y, m, 11)
        elif release_key == 'gdp':
            candidate = _gdp_release_day(y, m)

        if candidate and start <= candidate <= end:
            out.append(candidate.strftime('%Y-%m-%d'))

        m += 1
        if m > 12:
            m = 1
            y += 1

    return out


class MacroCalendarClient:
    """Macro release calendar backed by SQLite store + incremental FRED sync."""

    def __init__(self) -> None:
        self.api_key = settings.FRED_API_KEY
        self.base_url = settings.FRED_BASE_URL

    async def fetch_published_dates(
        self,
        release_id: int,
        start_date: str,
        end_date: str,
    ) -> list[str]:
        """Actual FRED publication dates only (/release/dates, no_data=false)."""
        if not self.api_key:
            raise ValueError('FRED_API_KEY not configured')

        url = f'{self.base_url}/release/dates'
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params={
                    'release_id': release_id,
                    'realtime_start': start_date,
                    'realtime_end': end_date,
                    'include_release_dates_with_no_data': 'false',
                    'api_key': self.api_key,
                    'file_type': 'json',
                    'limit': 1000,
                    'sort_order': 'asc',
                },
                timeout=30.0,
            )
            response.raise_for_status()
            return [
                row['date']
                for row in response.json().get('release_dates', [])
                if row.get('date')
            ]

    def _fred_window(self, release_key: str, *, full_backfill: bool) -> tuple[str, str]:
        today = datetime.now().date()
        end_s = today.strftime('%Y-%m-%d')

        if full_backfill:
            start = today - timedelta(days=730)
        elif not macro_store.max_fred_date(release_key):
            start = today - timedelta(days=FRED_BOOTSTRAP_DAYS)
        else:
            max_date = macro_store.max_fred_date(release_key)
            assert max_date is not None
            start = _parse_date(max_date) - timedelta(days=FRED_OVERLAP_DAYS)
            return start.strftime('%Y-%m-%d'), end_s

        return start.strftime('%Y-%m-%d'), end_s

    async def sync_release(
        self,
        release_key: str,
        release_id: int,
        *,
        full_backfill: bool = False,
    ) -> int:
        """Pull FRED (or static FOMC list) and persist to SQLite."""
        if release_key == 'fomc':
            count = macro_store.upsert_dates('fomc', list(FOMC_MEETING_DATES), 'fomc')
            macro_store.set_sync_meta('fomc', max(FOMC_MEETING_DATES))
            return count

        start_s, end_s = self._fred_window(release_key, full_backfill=full_backfill)
        try:
            published = await self.fetch_published_dates(release_id, start_s, end_s)
        except httpx.HTTPStatusError:
            published = []

        cleaned = _cap_one_per_month(
            _dedupe_release_dates(published, min_gap_days=MIN_RELEASE_GAP_DAYS)
        )
        count = macro_store.upsert_dates(release_key, cleaned, 'fred')
        last_fred = max(cleaned) if cleaned else macro_store.max_fred_date(release_key)
        macro_store.set_sync_meta(release_key, last_fred)
        return count

    def sync_scheduled_forward(self) -> int:
        """Persist rule-based forward dates (no FRED)."""
        macro_store.prune_past_scheduled()
        today = datetime.now().date()
        end = today + timedelta(days=SCHEDULED_HORIZON_DAYS)
        total = 0
        for key in MACRO_RELEASES:
            if key == 'fomc':
                continue
            scheduled = _scheduled_dates_for_release(key, today, end)
            total += macro_store.upsert_dates(key, scheduled, 'scheduled')
        return total

    async def sync_all(self, *, refresh: bool = False, full_backfill: bool = False) -> int:
        """Sync all releases from FRED/static sources when stale or forced."""
        if not self.api_key:
            raise ValueError('FRED_API_KEY not configured')

        synced = 0
        for key, meta in MACRO_RELEASES.items():
            age = macro_store.sync_age_hours(key)
            needs_sync = (
                refresh
                or full_backfill
                or age is None
                or age > MACRO_SYNC_MAX_AGE_HOURS
            )
            if needs_sync:
                await self.sync_release(key, meta['release_id'], full_backfill=full_backfill)
                await asyncio.sleep(0.4)
                synced += 1

        self.sync_scheduled_forward()
        macro_store.export_csv()
        return synced

    async def ensure_stored(self, *, refresh: bool = False) -> bool:
        """Return True if a FRED sync ran on this request."""
        if refresh:
            await self.sync_all(refresh=True)
            return True

        if macro_store.row_count() == 0:
            await self.sync_all(refresh=True, full_backfill=False)
            return True

        # Calendar reads should not hit FRED — only refresh scheduled forward dates locally.
        macro_store.prune_past_scheduled()
        self.sync_scheduled_forward()
        return False

    async def calendar(self, days: int = 90, *, refresh: bool = False) -> dict[str, Any]:
        if not self.api_key:
            raise ValueError('FRED_API_KEY not configured')

        synced_now = await self.ensure_stored(refresh=refresh)

        today = datetime.now().date()
        start = today - timedelta(days=days)
        end = today + timedelta(days=days)
        start_s = start.strftime('%Y-%m-%d')
        end_s = end.strftime('%Y-%m-%d')

        events: list[dict[str, Any]] = []
        for key, meta in MACRO_RELEASES.items():
            stored_dates = macro_store.resolve_dates_for_calendar(key, start_s, end_s)
            for date_str in stored_dates:
                source = macro_store.get_source(key, date_str) or 'scheduled'
                events.append(_event_fields(key, meta, date_str, source))

        events.sort(key=lambda e: (e['date'], e['name']))
        by_date: dict[str, list[dict[str, Any]]] = {}
        for event in events:
            by_date.setdefault(event['date'], []).append({
                k: v for k, v in event.items() if k != 'date'
            })

        market_days = market_days_in_range(start, end)
        market_map = market_by_date(start, end)

        sync_ages = {
            key: macro_store.sync_age_hours(key)
            for key in MACRO_RELEASES
        }
        oldest_sync = max((a for a in sync_ages.values() if a is not None), default=0.0)

        return {
            'start_date': start_s,
            'end_date': end_s,
            'days': days,
            'releases_tracked': list(MACRO_RELEASES.keys()),
            'events': events,
            'by_date': by_date,
            'market_days': market_days,
            'market_by_date': market_map,
            'count': len(events),
            'data_version': 5,
            'storage': 'sqlite',
            'storage_status': 'synced' if synced_now else 'stored',
            'stored_rows': macro_store.row_count(),
            'sync_age_hours': round(oldest_sync, 2),
            'csv_path': str(macro_store.db_path.parent / 'macro_release_dates.csv'),
        }


macro_calendar = MacroCalendarClient()
