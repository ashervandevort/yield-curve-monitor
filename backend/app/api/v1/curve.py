"""Yield curve API endpoints."""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from datetime import datetime

from ...core import fred_client, settings

router = APIRouter(prefix='/curve', tags=['curve'])

VALID_WINDOWS = {'1D', '1W', '1M', '3M', '6M', '1Y'}


def parse_tenors(tenors: Optional[str], curve_type: str) -> list[str]:
    """Parse and validate requested tenors."""
    valid_tenors = set(settings.FULL_TENORS)
    if tenors:
        tenor_list = [t.strip().upper() for t in tenors.split(',') if t.strip()]
    elif curve_type == 'futures':
        tenor_list = settings.FUTURES_TENORS
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
        # Fetch all tenors needed for spreads + butterflies + regime
        needed_tenors = ['3M', '2Y', '5Y', '10Y', '20Y', '30Y']
        result = await fred_client.get_yield_curve(tenors=needed_tenors)
        yields = result['yields']
        
        if len(yields) < 2:
            raise HTTPException(status_code=404, detail="Insufficient data for spreads")
        
        spreads = {}
        
        # 2s10s (10Y - 2Y) - Most watched
        if '10Y' in yields and '2Y' in yields:
            spreads['2s10s'] = {
                'value': round((yields['10Y'] - yields['2Y']) * 100, 1),  # bp
                'description': '10Y minus 2Y',
                'interpretation': 'steepening' if yields['10Y'] > yields['2Y'] else 'inverted'
            }
        
        # 5s30s (30Y - 5Y)
        if '30Y' in yields and '5Y' in yields:
            spreads['5s30s'] = {
                'value': round((yields['30Y'] - yields['5Y']) * 100, 1),
                'description': '30Y minus 5Y',
                'interpretation': 'steepening' if yields['30Y'] > yields['5Y'] else 'inverted'
            }
        
        # 3m10y (10Y - 3M) - Recession indicator
        if '10Y' in yields and '3M' in yields:
            spreads['3m10y'] = {
                'value': round((yields['10Y'] - yields['3M']) * 100, 1),
                'description': '10Y minus 3M',
                'interpretation': 'normal' if yields['10Y'] > yields['3M'] else 'inverted'
            }
        
        # 2s30s (30Y - 2Y)
        if '30Y' in yields and '2Y' in yields:
            spreads['2s30s'] = {
                'value': round((yields['30Y'] - yields['2Y']) * 100, 1),
                'description': '30Y minus 2Y',
                'interpretation': 'steepening' if yields['30Y'] > yields['2Y'] else 'inverted'
            }
        
        # 2s5s (5Y - 2Y)
        if '5Y' in yields and '2Y' in yields:
            spreads['2s5s'] = {
                'value': round((yields['5Y'] - yields['2Y']) * 100, 1),
                'description': '5Y minus 2Y',
                'interpretation': 'steepening' if yields['5Y'] > yields['2Y'] else 'inverted'
            }

        # 5s10s30s butterfly: (5Y + 30Y)/2 - 10Y
        if '5Y' in yields and '10Y' in yields and '30Y' in yields:
            bfly = ((yields['5Y'] + yields['30Y']) / 2 - yields['10Y']) * 100
            spreads['5s10s30s'] = {
                'value': round(bfly, 1),
                'description': '(5Y+30Y)/2 minus 10Y',
                'interpretation': 'normal' if bfly > 0 else 'inverted'
            }

        # 2s5s10s butterfly: (2Y + 10Y)/2 - 5Y
        if '2Y' in yields and '5Y' in yields and '10Y' in yields:
            bfly2 = ((yields['2Y'] + yields['10Y']) / 2 - yields['5Y']) * 100
            spreads['2s5s10s'] = {
                'value': round(bfly2, 1),
                'description': '(2Y+10Y)/2 minus 5Y',
                'interpretation': 'normal' if bfly2 > 0 else 'inverted'
            }

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

            # Regime label
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


# Need to import pandas for the history endpoint
import pandas as pd
