"""US bond market holidays and early closes (SIFMA / NYSE-aligned rules)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

ET = ZoneInfo('America/New_York')
# FRED DGS series usually publish same-day after ~3:30 PM ET; cron runs ~5:30 PM ET.
FRED_DGS_PUBLISH_CUTOFF_ET = (17, 15)


def _easter_sunday(year: int) -> date:
    """Gregorian Easter Sunday."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _observe_fixed_holiday(d: date) -> date:
    """Weekend → nearest weekday (Fri if Sat, Mon if Sun)."""
    if d.weekday() == 5:
        return d - timedelta(days=1)
    if d.weekday() == 6:
        return d + timedelta(days=1)
    return d


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """nth weekday of month (weekday: Mon=0 … Sun=6)."""
    d = date(year, month, 1)
    while d.weekday() != weekday:
        d += timedelta(days=1)
    d += timedelta(weeks=n - 1)
    return d


def _last_weekday(year: int, month: int, weekday: int) -> date:
    d = date(year, month + 1, 1) - timedelta(days=1)
    while d.weekday() != weekday:
        d -= timedelta(days=1)
    return d


def bond_market_holidays(year: int) -> dict[date, str]:
    """Full-day US bond market closures for a calendar year."""
    holidays: dict[date, str] = {}

    def add(observed: date, name: str) -> None:
        holidays[observed] = name

    add(_observe_fixed_holiday(date(year, 1, 1)), "New Year's Day")
    add(_nth_weekday(year, 1, 0, 3), 'Martin Luther King Jr. Day')
    add(_nth_weekday(year, 2, 0, 3), "Presidents' Day")
    add(_easter_sunday(year) - timedelta(days=2), 'Good Friday')
    add(_last_weekday(year, 5, 0), 'Memorial Day')
    add(_observe_fixed_holiday(date(year, 6, 19)), 'Juneteenth')
    add(_observe_fixed_holiday(date(year, 7, 4)), 'Independence Day')
    add(_nth_weekday(year, 9, 0, 1), 'Labor Day')
    add(_nth_weekday(year, 11, 3, 4), 'Thanksgiving')
    add(_observe_fixed_holiday(date(year, 12, 25)), 'Christmas')

    return holidays


def bond_market_early_closes(year: int) -> dict[date, str]:
    """Bond market early closes (typically 2:00 PM ET)."""
    early: dict[date, str] = {}
    holidays = bond_market_holidays(year)

    def add_if_open(d: date, name: str) -> None:
        if d.weekday() >= 5 or d in holidays:
            return
        early[d] = name

    # Day before Independence Day when July 4 is weekday
    july4 = _observe_fixed_holiday(date(year, 7, 4))
    if july4.weekday() not in (5, 6):
        add_if_open(july4 - timedelta(days=1), 'Day before Independence Day')

    add_if_open(_nth_weekday(year, 11, 3, 4) + timedelta(days=1), 'Black Friday')
    add_if_open(date(year, 12, 24), 'Christmas Eve')
    add_if_open(date(year, 12, 31), "New Year's Eve")

    return early


def market_days_in_range(start: date, end: date) -> list[dict[str, Any]]:
    """Bond market closures and early closes between start and end (inclusive)."""
    if start > end:
        return []

    years = range(start.year, end.year + 1)
    closed: dict[date, str] = {}
    early: dict[date, str] = {}
    for y in years:
        closed.update(bond_market_holidays(y))
        for d, name in bond_market_early_closes(y).items():
            if d not in closed:
                early[d] = name

    out: list[dict[str, Any]] = []
    d = start
    while d <= end:
        iso = d.strftime('%Y-%m-%d')
        if d in closed:
            out.append({
                'date': iso,
                'day_type': 'closed',
                'name': closed[d],
                'close_time_et': None,
            })
        elif d in early:
            out.append({
                'date': iso,
                'day_type': 'early_close',
                'name': early[d],
                'close_time_et': '14:00',
            })
        elif d.weekday() >= 5:
            out.append({
                'date': iso,
                'day_type': 'weekend',
                'name': 'Weekend',
                'close_time_et': None,
            })
        d += timedelta(days=1)

    return out


def market_by_date(start: date, end: date) -> dict[str, dict[str, Any]]:
    return {row['date']: row for row in market_days_in_range(start, end)}


def is_bond_trading_day(d: date) -> bool:
    """True on weekdays that are not full bond-market holidays."""
    if d.weekday() >= 5:
        return False
    return d not in bond_market_holidays(d.year)


def previous_bond_trading_day(d: date) -> date:
    """Most recent bond trading day strictly before ``d``."""
    cursor = d - timedelta(days=1)
    while not is_bond_trading_day(cursor):
        cursor -= timedelta(days=1)
    return cursor


def expected_latest_observation_date(
    as_of: datetime | None = None,
) -> date:
    """
    Latest FRED DGS observation date we should already have stored.

    Before the publish cutoff on a trading day, expect prior session's close.
    After cutoff (and on weekends/holidays), expect the most recent session.
    """
    et_now = (as_of or datetime.now(timezone.utc)).astimezone(ET)
    today = et_now.date()

    if is_bond_trading_day(today):
        if (et_now.hour, et_now.minute) >= FRED_DGS_PUBLISH_CUTOFF_ET:
            return today
        return previous_bond_trading_day(today)

    cursor = today
    while not is_bond_trading_day(cursor):
        cursor -= timedelta(days=1)
    return cursor
