"""Treasury futures CTD metadata endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ...core import futures_store

router = APIRouter(prefix='/futures', tags=['futures'])


class CtdUpdate(BaseModel):
    symbol: str
    effective_date: str = Field(..., description='YYYY-MM-DD when CF becomes effective')
    cusip: str
    coupon_pct: float
    maturity: str = Field(..., description='YYYY-MM-DD')
    conversion_factor: float
    source: str = 'manual'


@router.get('/ctd')
async def get_ctd():
    """Latest CTD + conversion factor per futures symbol."""
    return {'success': True, 'data': futures_store.ctd_snapshot()}


@router.post('/ctd')
async def upsert_ctd(body: CtdUpdate):
    """Update conversion factor when CME publishes a new deliverable."""
    sym = body.symbol.upper()
    try:
        futures_store.upsert_ctd(
            sym,
            body.effective_date,
            body.cusip,
            body.coupon_pct,
            body.maturity,
            body.conversion_factor,
            body.source,
        )
        spec = futures_store.latest_ctd(sym, body.effective_date)
        return {'success': True, 'data': spec}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
