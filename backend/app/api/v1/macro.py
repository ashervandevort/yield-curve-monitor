"""Macro economic calendar API endpoints."""
from fastapi import APIRouter, HTTPException, Query

from ...core.macro_calendar import macro_calendar

router = APIRouter(prefix='/macro', tags=['macro'])


@router.get('/calendar')
async def get_macro_calendar(
    days: int = Query(
        90,
        ge=1,
        le=365,
        description='Days before/after today to include release dates',
    ),
    refresh: bool = Query(
        False,
        description='Bypass SQLite cache and refresh FRED release dates',
    ),
):
    """
    Upcoming and recent FRED release dates for key macro indicators.

    Tracks FOMC, CPI, Employment, PPI, and GDP using verified FRED release IDs.
    """
    try:
        calendar = await macro_calendar.calendar(days=days, refresh=refresh)
        return {
            'success': True,
            'data': calendar,
        }
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
