"""Yield curve API endpoints."""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from datetime import datetime, timedelta

import pandas as pd

from ...core import fred_client, settings
from ...core import futures_client
from ...core.curve_store import curve_store
from ...core.spreads import (
    SPREAD_DESCRIPTIONS,
    SPREAD_KEYS,
    compute_spread_series,
    spread_snapshot,
    tenors_for_spreads,
)

router = APIRouter(prefix='/curve', tags=['curve'])

VALID_WINDOWS = {'1D', '1W', '1M', '3M', '6M', '1Y'}


def parse_tenors(tenors: Optional[str], curve_type: str) -> list[str]:
    """Parse and validate requested tenors or futures symbols."""
    if curve_type == 'futures':
        valid = set(settings.FUTURES_SYMBOLS)
        if tenors:
            key_list = [t.strip().upper() for t in tenors.split(',') if t.strip()]
        else:
            key_list = settings.FUTURES_SYMBOLS
        invalid = [k for k in key_list if k not in valid]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid futures symbol(s): {invalid}. Valid: {settings.FUTURES_SYMBOLS}",
            )
        return key_list

    valid_tenors = set(settings.FULL_TENORS)
    if tenors:
        tenor_list = [t.strip().upper() for t in tenors.split(',') if t.strip()]
    elif curve_type == 'full':
        tenor_list = settings.FULL_TENORS
    else:
        raise HTTPException(status_code=400, detail="curve_type must be 'full' or 'futures'")

    invalid = [tenor for tenor in tenor_list if tenor not in valid_tenors]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid tenor(s): {invalid}. Valid tenors: {settings.FULL_TENORS}"
        )
    return tenor_list


def parse_windows(windows: str) -> list[str]:
    """Parse and validate requested change windows."""
    window_list = [w.strip().upper() for w in windows.split(',') if w.strip()]
    invalid = [window for window in window_list if window not in VALID_WINDOWS]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid window(s): {invalid}. Valid windows: {sorted(VALID_WINDOWS)}"
        )
    return window_list


def validate_date_range(start_date: str, end_date: str) -> None:
    """Validate date strings and range size."""
    try:
        start = datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.strptime(end_date, '%Y-%m-%d')
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")
    if (end - start).days > 3650:
        raise HTTPException(status_code=400, detail="Date range cannot exceed 10 years")


@router.get('/latest')
async def get_latest_curve(
    tenors: Optional[str] = Query(
        None, 
        description="Comma-separated tenors (e.g., '2Y,5Y,10Y,30Y'). Defaults to full curve."
    ),
    curve_type: str = Query(
        'full',
        description="'full' for all tenors or 'futures' for futures-matching tenors"
    ),
    refresh: bool = Query(
        False,
        description="Force a fresh FRED pull instead of using cached snapshots"
    )
):
    """
    Get the latest yield curve.
    
    Returns yields for all tenors or a subset.
    """
    tenor_list = parse_tenors(tenors, curve_type)
    
    try:
        if curve_type == 'futures':
            result = await futures_client.get_futures_curve(symbols=tenor_list)
        else:
            result = await fred_client.get_yield_curve(tenors=tenor_list, refresh=refresh)
        
        if not result['yields']:
            raise HTTPException(status_code=404, detail="No yield data available")
        
        return {
            'success': True,
            'data': result,
            'tenors_requested': tenor_list,
            'curve_type': curve_type
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/history')
async def get_curve_history(
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    tenors: Optional[str] = Query(None, description="Comma-separated tenors"),
    curve_type: str = Query('full', description="'full' or 'futures'")
):
    """
    Get historical yield curve data.
    
    Returns time series of yields for specified date range.
    """
    validate_date_range(start_date, end_date)
    tenor_list = parse_tenors(tenors, curve_type)
    
    try:
        df = await fred_client.fetch_curve_history(start_date, end_date, tenor_list)
        
        if df.empty:
            raise HTTPException(status_code=404, detail="No data for specified range")
        
        # Convert to JSON-friendly format
        data = []
        for date, row in df.iterrows():
            point = {'date': date.strftime('%Y-%m-%d')}
            for tenor in tenor_list:
                if tenor in row:
                    value = row[tenor]
                    point[tenor] = float(value) if not pd.isna(value) else None
            data.append(point)
        
        return {
            'success': True,
            'data': data,
            'tenors': tenor_list,
            'start_date': start_date,
            'end_date': end_date,
            'count': len(data)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/changes')
async def get_curve_changes(
    windows: str = Query(
        '1D,1W,1M,1Y',
        description="Comma-separated time windows (e.g., '1D,1W,1M,1Y')"
    ),
    tenors: Optional[str] = Query(None, description="Comma-separated tenors"),
    curve_type: str = Query('full', description="'full' or 'futures'")
):
    """
    Get yield changes across different time windows.
    
    Returns basis point changes from each historical point.
    """
    window_list = parse_windows(windows)
    tenor_list = parse_tenors(tenors, curve_type)
    
    try:
        if curve_type == 'futures':
            changes = await futures_client.get_futures_changes(window_list, tenor_list)
        else:
            changes = await fred_client.fetch_curve_changes(window_list, tenor_list)
        
        if not changes:
            raise HTTPException(status_code=404, detail="No change data available")
        
        return {
            'success': True,
            'data': changes,
            'windows': window_list,
            'tenors': tenor_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/spreads')
async def get_key_spreads():
    """
    Get key yield curve spreads.
    
    Returns common spread measures like 2s10s, 5s30s, etc.
    """
    try:
        needed_tenors = tenors_for_spreads(list(SPREAD_KEYS))
        for tenor in ('20Y',):
            if tenor not in needed_tenors:
                needed_tenors.append(tenor)
        result = await fred_client.get_yield_curve(tenors=needed_tenors)
        yields = result['yields']
        
        if len(yields) < 2:
            raise HTTPException(status_code=404, detail="Insufficient data for spreads")
        
        spreads = {}
        for spread_key in SPREAD_KEYS:
            snapshot = spread_snapshot(spread_key, yields)
            if snapshot:
                spreads[spread_key] = snapshot

        # ── Curve regime ──────────────────────────────────────────────────────
        regime = None
        regime_tenors = ['2Y', '5Y', '10Y', '20Y', '30Y']
        available_regime = [t for t in regime_tenors if t in yields]
        if len(available_regime) >= 3:
            level = round(sum(yields[t] for t in available_regime) / len(available_regime), 3)
            slope = round(
                (yields.get('10Y', 0) - yields.get('2Y', 0)) * 100, 1
            ) if '10Y' in yields and '2Y' in yields else 0.0
            curvature = round(
                ((yields.get('2Y', 0) + yields.get('30Y', 0)) / 2 - yields.get('10Y', 0)) * 100, 1
            ) if all(t in yields for t in ('2Y', '10Y', '30Y')) else 0.0

            if slope < -10:
                label = 'INVERTED'
            elif slope < 30:
                label = 'FLAT'
            elif curvature > 20:
                label = 'HUMPED'
            else:
                label = 'NORMAL'

            regime = {
                'level': level,
                'slope': slope,
                'curvature': curvature,
                'label': label,
            }

        return {
            'success': True,
            'date': result['date'],
            'spreads': spreads,
            'yields': yields,
            'regime': regime,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def parse_spreads(spreads: str) -> list[str]:
    """Parse and validate requested spread keys."""
    spread_list = [s.strip().lower() for s in spreads.split(',') if s.strip()]
    invalid = [spread for spread in spread_list if spread not in SPREAD_KEYS]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid spread(s): {invalid}. Valid spreads: {sorted(SPREAD_KEYS)}",
        )
    if not spread_list:
        raise HTTPException(status_code=400, detail="At least one spread is required")
    return spread_list


@router.get('/spreads/history')
async def get_spread_history(
    spreads: str = Query(
        '2s10s,3m10y',
        description="Comma-separated spreads (e.g. '2s10s,3m10y,5s30s')",
    ),
    days: int = Query(
        365,
        ge=1,
        le=3650,
        description='Number of calendar days ending today',
    ),
):
    """
    Historical spread time series computed from stored curve history.

    Uses the same formulas as GET /curve/spreads (basis points).
    """
    spread_list = parse_spreads(spreads)
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
    tenor_list = tenors_for_spreads(spread_list)

    try:
        history = curve_store.curve_history(start_date, end_date, tenor_list)
        if history.empty:
            history = await fred_client.fetch_curve_history(start_date, end_date, tenor_list)

        if history.empty:
            raise HTTPException(status_code=404, detail="No spread history for specified range")

        series_by_spread = {
            spread_key: compute_spread_series(history, spread_key)
            for spread_key in spread_list
        }

        if not any(series_by_spread.values()):
            raise HTTPException(status_code=404, detail="No complete spread rows in range")

        return {
            'success': True,
            'start_date': start_date,
            'end_date': end_date,
            'days': days,
            'spreads': spread_list,
            'descriptions': {key: SPREAD_DESCRIPTIONS[key] for key in spread_list},
            'data': series_by_spread,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
