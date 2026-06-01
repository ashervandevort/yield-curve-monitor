"""FRED API client for fetching Treasury yield data."""
import asyncio
import httpx
from datetime import datetime, timedelta, timezone
from typing import Optional
import pandas as pd

from .config import settings
from .curve_store import curve_store


class FredClient:
    """Client for interacting with FRED API."""
    
    def __init__(self):
        self.api_key = settings.FRED_API_KEY
        self.base_url = settings.FRED_BASE_URL
        self.series_map = settings.FRED_SERIES

    def _history_cache_usable(
        self,
        cached: pd.DataFrame,
        tenors: list[str],
        start_date: str,
    ) -> bool:
        """Only reuse cache when it spans the range with complete multi-tenor rows."""
        if cached.empty or not all(tenor in cached.columns for tenor in tenors):
            return False

        complete = cached[tenors].dropna(how='any')
        if len(complete) < 2:
            return False

        start_ts = pd.Timestamp(start_date)
        # Reject sparse caches that only cover recent days (breaks 1W/1M/1Y overlays)
        if complete.index.min() > start_ts + pd.Timedelta(days=14):
            return False

        return True

    def _cache_age_hours(self, fetched_at: Optional[str]) -> Optional[float]:
        if not fetched_at:
            return None
        try:
            fetched = datetime.fromisoformat(fetched_at)
            if fetched.tzinfo is None:
                fetched = fetched.replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - fetched).total_seconds() / 3600
        except ValueError:
            return None
    
    async def fetch_series(
        self, 
        series_id: str, 
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> pd.DataFrame:
        """
        Fetch a single FRED series.
        
        Args:
            series_id: FRED series ID (e.g., 'DGS10')
            start_date: Start date (YYYY-MM-DD format)
            end_date: End date (YYYY-MM-DD format)
        
        Returns:
            DataFrame with 'date' and 'value' columns
        """
        if not self.api_key:
            raise ValueError("FRED_API_KEY not configured")
        
        # Default to last 2 years if no dates provided
        if not end_date:
            end_date = datetime.now().strftime('%Y-%m-%d')
        if not start_date:
            start_date = (datetime.now() - timedelta(days=730)).strftime('%Y-%m-%d')
        
        url = f"{self.base_url}/series/observations"
        params = {
            'series_id': series_id,
            'api_key': self.api_key,
            'file_type': 'json',
            'observation_start': start_date,
            'observation_end': end_date,
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=30.0)
            response.raise_for_status()
            data = response.json()
        
        observations = data.get('observations', [])
        
        # Convert to DataFrame
        df = pd.DataFrame(observations)
        if df.empty:
            return pd.DataFrame(columns=['date', 'value'])
        
        # Clean up
        df = df[['date', 'value']].copy()
        df['value'] = pd.to_numeric(df['value'], errors='coerce')
        df = df.dropna(subset=['value'])
        df['date'] = pd.to_datetime(df['date'])
        
        return df
    
    async def fetch_yield_curve(
        self,
        date: Optional[str] = None,
        tenors: Optional[list[str]] = None
    ) -> dict:
        """
        Fetch full yield curve for a specific date (concurrent requests).
        """
        tenors = tenors or list(self.series_map.keys())

        if date:
            start = date
            end = date
        else:
            end = datetime.now().strftime('%Y-%m-%d')
            # 10-day window: handles weekends, holidays, and late FRED publications
            start = (datetime.now() - timedelta(days=10)).strftime('%Y-%m-%d')

        async def _fetch_one(tenor: str):
            series_id = self.series_map.get(tenor)
            if not series_id:
                return tenor, None, None
            for attempt in range(2):   # one retry on 429
                try:
                    df = await self.fetch_series(series_id, start, end)
                    if not df.empty:
                        latest = df.iloc[-1]
                        return tenor, float(latest['value']), latest['date']
                    return tenor, None, None
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429 and attempt == 0:
                        await asyncio.sleep(1.0)
                        continue
                    print(f"Error fetching {tenor} ({series_id}): {e}")
                    return tenor, None, None
                except Exception as e:
                    print(f"Error fetching {tenor} ({series_id}): {e}")
                    return tenor, None, None
            return tenor, None, None

        # Fetch all tenors concurrently (semaphore limits to 4 at a time to respect FRED rate limit)
        sem = asyncio.Semaphore(4)

        async def _fetch_one_throttled(tenor: str):
            async with sem:
                return await _fetch_one(tenor)

        tasks = [_fetch_one_throttled(t) for t in tenors]
        results = await asyncio.gather(*tasks)

        yields: dict[str, float] = {}
        latest_date = None
        missing_tenors: list[str] = []

        for tenor, value, obs_date in results:
            if value is not None and obs_date is not None:
                yields[tenor] = value
                if latest_date is None or obs_date > latest_date:
                    latest_date = obs_date
            else:
                missing_tenors.append(tenor)

        if latest_date and yields:
            stored = curve_store.upsert_curve(latest_date.strftime('%Y-%m-%d'), yields)
            fetched_at = stored.fetched_at
        else:
            fetched_at = None

        return {
            'date': latest_date.strftime('%Y-%m-%d') if latest_date else None,
            'yields': yields,
            'metadata': {
                'source': 'FRED',
                'fetched_at': fetched_at,
                'cache_status': 'refreshed' if fetched_at else 'miss',
                'missing_tenors': missing_tenors,
                'is_partial': len(missing_tenors) > 0,
            }
        }

    async def get_yield_curve(
        self,
        date: Optional[str] = None,
        tenors: Optional[list[str]] = None,
        refresh: bool = False,
    ) -> dict:
        """Get a curve from local storage first, refreshing from FRED when needed."""
        tenors = tenors or list(self.series_map.keys())

        if date:
            return await self.fetch_yield_curve(date=date, tenors=tenors)

        cached = curve_store.latest_curve(tenors)
        cache_age = self._cache_age_hours(cached.fetched_at) if cached else None
        cache_fresh = cache_age is not None and cache_age <= settings.CURVE_CACHE_MAX_AGE_HOURS
        cache_complete = cached is not None and all(tenor in cached.yields for tenor in tenors)

        if cached and cache_fresh and cache_complete and not refresh:
            missing = [tenor for tenor in tenors if tenor not in cached.yields]
            return {
                'date': cached.date,
                'yields': cached.yields,
                'metadata': {
                    'source': cached.source,
                    'fetched_at': cached.fetched_at,
                    'cache_status': 'hit',
                    'cache_age_hours': round(cache_age, 2) if cache_age is not None else None,
                    'missing_tenors': missing,
                    'is_partial': len(missing) > 0,
                    'stale': False,
                }
            }

        try:
            refreshed = await self.fetch_yield_curve(tenors=tenors)
            if refreshed['yields']:
                return refreshed
        except Exception as e:
            if not cached:
                raise
            print(f"FRED refresh failed, using cached curve: {e}")

        if cached:
            missing = [tenor for tenor in tenors if tenor not in cached.yields]
            return {
                'date': cached.date,
                'yields': cached.yields,
                'metadata': {
                    'source': cached.source,
                    'fetched_at': cached.fetched_at,
                    'cache_status': 'stale_fallback',
                    'cache_age_hours': round(cache_age, 2) if cache_age is not None else None,
                    'missing_tenors': missing,
                    'is_partial': len(missing) > 0,
                    'stale': True,
                }
            }

        raise ValueError("No yield data available")
    
    def _history_end_covered(
        self,
        cached: pd.DataFrame,
        tenors: list[str],
        end_date: str,
    ) -> bool:
        """True when cached rows include complete tenors through end_date (±3 days)."""
        if cached.empty or not all(tenor in cached.columns for tenor in tenors):
            return False
        complete = cached[tenors].dropna(how='any')
        if complete.empty:
            return False
        end_ts = pd.Timestamp(end_date)
        return complete.index.max() >= end_ts - pd.Timedelta(days=3)

    async def _fetch_fred_history_slice(
        self,
        fetch_start: str,
        end_date: str,
        tenors: list[str],
    ) -> pd.DataFrame:
        """Pull one date slice from FRED and upsert into local storage."""
        all_data: dict[str, pd.Series] = {}

        for tenor in tenors:
            series_id = self.series_map.get(tenor)
            if not series_id:
                continue

            try:
                df = await self.fetch_series(series_id, fetch_start, end_date)
                if not df.empty:
                    df = df.set_index('date')
                    all_data[tenor] = df['value']
            except Exception as e:
                print(f"Error fetching {tenor}: {e}")
                continue

        if not all_data:
            return pd.DataFrame()

        result = pd.DataFrame(all_data).sort_index()
        for date, row in result.iterrows():
            yields = {
                tenor: float(value)
                for tenor, value in row.items()
                if pd.notna(value)
            }
            if yields:
                curve_store.upsert_curve(date.strftime('%Y-%m-%d'), yields)

        return result

    async def fetch_curve_history(
        self,
        start_date: str,
        end_date: str,
        tenors: Optional[list[str]] = None
    ) -> pd.DataFrame:
        """
        Fetch historical yield curves, appending incrementally from local storage.

        When storage already has data through date X, only FRED-fetches from
        X-3 days through end_date, then returns the merged stored range.
        """
        tenors = tenors or list(self.series_map.keys())

        cached = curve_store.curve_history(start_date, end_date, tenors)
        if (
            self._history_cache_usable(cached, tenors, start_date)
            and self._history_end_covered(cached, tenors, end_date)
        ):
            return cached

        max_stored = curve_store.max_stored_date()
        fetch_start = start_date

        if max_stored:
            max_ts = pd.Timestamp(max_stored)
            start_ts = pd.Timestamp(start_date)
            if max_ts >= start_ts:
                overlap_start = (max_ts - pd.Timedelta(days=3)).strftime('%Y-%m-%d')
                fetch_start = max(start_date, overlap_start)

        await self._fetch_fred_history_slice(fetch_start, end_date, tenors)
        return curve_store.curve_history(start_date, end_date, tenors)
    
    async def fetch_curve_changes(
        self,
        windows: list[str] = ['1D', '1W', '1M', '1Y'],
        tenors: Optional[list[str]] = None
    ) -> dict:
        """
        Calculate yield changes across different time windows.

        Each tenor is compared independently (handles FRED series that publish
        on different dates).
        """
        tenors = tenors or list(self.series_map.keys())

        window_days = {
            '1D': 1,
            '1W': 7,
            '1M': 30,
            '3M': 90,
            '6M': 180,
            '1Y': 365,
        }

        latest = await self.get_yield_curve(tenors=tenors)
        latest_yields = latest['yields']
        latest_date = pd.Timestamp(latest['date']) if latest.get('date') else None

        if not latest_date or not latest_yields:
            return {}

        max_days = max(window_days.get(w, 1) for w in windows) + 10
        end_date = latest_date.strftime('%Y-%m-%d')
        start_date = (latest_date - timedelta(days=max_days)).strftime('%Y-%m-%d')
        history = await self.fetch_curve_history(start_date, end_date, tenors)

        changes = {}
        for window in windows:
            days = window_days.get(window, 1)
            target_date = latest_date - timedelta(days=days)
            window_changes: dict[str, float] = {}
            comparison_dates: list[pd.Timestamp] = []

            for tenor in tenors:
                if tenor not in latest_yields:
                    continue

                comparison_date = None
                comparison_yield = None

                if not history.empty and tenor in history.columns:
                    series = history[tenor].dropna()
                    prior = series[series.index <= target_date]
                    if not prior.empty:
                        comparison_date = prior.index[-1]
                        comparison_yield = float(prior.iloc[-1])

                if comparison_date is None:
                    # Fallback: pull short history for this tenor from FRED
                    series_id = self.series_map.get(tenor)
                    if series_id:
                        try:
                            df = await self.fetch_series(
                                series_id,
                                start_date,
                                end_date,
                            )
                            if not df.empty:
                                df = df.set_index('date')['value']
                                prior = df[df.index <= target_date]
                                if not prior.empty:
                                    comparison_date = prior.index[-1]
                                    comparison_yield = float(prior.iloc[-1])
                        except Exception as e:
                            print(f"Error fetching change history for {tenor}: {e}")

                if comparison_date is None or comparison_yield is None:
                    continue

                window_changes[tenor] = round(
                    (latest_yields[tenor] - comparison_yield) * 100, 1
                )
                comparison_dates.append(comparison_date)

            if window_changes:
                from_date = min(comparison_dates).strftime('%Y-%m-%d') if comparison_dates else target_date.strftime('%Y-%m-%d')
                changes[window] = {
                    'from_date': from_date,
                    'to_date': latest_date.strftime('%Y-%m-%d'),
                    'changes': window_changes,
                }

        return changes


# Singleton instance
fred_client = FredClient()
