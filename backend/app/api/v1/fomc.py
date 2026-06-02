"""FOMC meeting countdown and rate probability endpoints."""
from fastapi import APIRouter, HTTPException, Query

from ...core.fomc_client import build_fomc_snapshot

router = APIRouter(prefix='/fomc', tags=['fomc'])


@router.get('/snapshot')
async def get_fomc_snapshot(refresh: bool = Query(False, description='Force new FRED pull')):
    """Next FOMC meeting, countdown, target range, and probability snapshot."""
    try:
        data = await build_fomc_snapshot(refresh=refresh)
        return {'success': True, 'data': data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
