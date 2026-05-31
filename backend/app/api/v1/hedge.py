"""Hedging optimizer API endpoints."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Any

from ...core import hedging_optimizer, settings

router = APIRouter(prefix='/hedge', tags=['hedge'])


# ── Request / Response models ──────────────────────────────────────────────────

class HedgeRequest(BaseModel):
    target_dv01: dict[str, float] = Field(
        ...,
        description=(
            "Target key-rate DV01 by tenor ($/bp). "
            "Positive = long duration, negative = short. "
            "Valid tenors: 2Y, 3Y, 5Y, 7Y, 10Y, 20Y, 30Y."
        ),
        examples=[{'2Y': 50_000, '5Y': 25_000, '10Y': -30_000, '30Y': -20_000}],
    )
    instruments: Optional[list[str]] = Field(
        None,
        description="Futures to include; defaults to all (ZT, ZF, ZN, TN, ZB, UB).",
    )
    max_contracts: int = Field(1_000, ge=1, le=10_000, description="Per-instrument absolute bound.")
    penalty_per_contract: float = Field(
        0.0,
        ge=0,
        le=100_000,
        description="Penalty on gross contract count (promotes parsimonious hedges).",
    )
    residual_tolerance: float = Field(
        1_000.0,
        ge=0,
        le=1_000_000,
        description="Per-tenor residual DV01 threshold for warnings.",
    )
    current_positions: Optional[dict[str, int]] = Field(
        None,
        description=(
            "Existing futures book (instrument → contracts). "
            "When provided, a rebalancing delta is returned."
        ),
    )


class HedgeResponse(BaseModel):
    success: bool
    contracts: dict[str, int]
    achieved_dv01: dict[str, float]
    target_dv01: dict[str, float]
    residual: dict[str, float]
    total_residual: float
    gross_contracts: int
    gross_dv01: float
    residual_ratio: float
    within_tolerance: bool
    margin_estimate: float
    contracts_detail: list[dict[str, Any]]
    warnings: list[str]
    assumptions: list[str]
    scenarios: list[dict[str, Any]]
    factor_target: dict[str, float]
    factor_hedge: dict[str, float]
    factor_net: dict[str, float]
    effectiveness: dict[str, float]
    rebalance: Optional[dict[str, Any]]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post('/optimize', response_model=HedgeResponse)
async def optimize_hedge(request: HedgeRequest):
    """
    Optimise Treasury futures positions to match a target key-rate DV01 profile.

    Supply target DV01 exposures by tenor (7-point grid: 2Y, 3Y, 5Y, 7Y, 10Y, 20Y, 30Y).
    Returns optimal contract counts plus scenario P&L, factor exposures, hedge
    effectiveness, and (optionally) rebalancing delta from current positions.
    """
    valid_tenors = set(settings.KEY_RATE_TENORS)
    for tenor in request.target_dv01:
        if tenor.upper() not in valid_tenors:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid tenor '{tenor}'. Valid tenors: {sorted(valid_tenors)}",
            )

    normalized_target = {k.upper(): v for k, v in request.target_dv01.items()}

    if request.instruments:
        valid_instruments = set(settings.FUTURES_CONTRACTS)
        for inst in request.instruments:
            if inst.upper() not in valid_instruments:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid instrument '{inst}'. Valid: {sorted(valid_instruments)}",
                )
        instruments = [i.upper() for i in request.instruments]
    else:
        instruments = None

    current_positions: Optional[dict[str, int]] = None
    if request.current_positions:
        current_positions = {k.upper(): v for k, v in request.current_positions.items()}

    try:
        result = hedging_optimizer.optimize(
            target_dv01=normalized_target,
            instruments=instruments,
            max_contracts=request.max_contracts,
            round_to_int=True,
            penalty_per_contract=request.penalty_per_contract,
            residual_tolerance=request.residual_tolerance,
            current_positions=current_positions,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    margin = hedging_optimizer.calculate_margin_estimate(result.contracts)

    contracts_detail = []
    for inst, count in result.contracts.items():
        info = hedging_optimizer.get_contract_info(inst)
        contracts_detail.append({
            'symbol': inst,
            'name': info.get('name', inst),
            'contracts': count,
            'dv01_per_contract': info.get('dv01_approx', 0),
            'total_dv01': round(count * info.get('dv01_approx', 0), 2),
            'key_rate_exposures': {
                tenor: round(count * exp, 2)
                for tenor, exp in info.get('exposures', {}).items()
            },
            'direction': 'LONG' if count > 0 else 'SHORT',
        })

    rebalance_out: Optional[dict] = None
    if result.rebalance:
        rb = result.rebalance
        rebalance_out = {
            'delta': rb.delta,
            'turnover_contracts': rb.turnover_contracts,
            'closed_positions': rb.closed_positions,
            'turnover_margin_estimate': hedging_optimizer.calculate_margin_estimate(
                {k: abs(v) for k, v in rb.delta.items()}
            ),
        }

    return HedgeResponse(
        success=True,
        contracts=result.contracts,
        achieved_dv01=result.achieved_dv01,
        target_dv01=result.target_dv01,
        residual=result.residual,
        total_residual=result.total_residual,
        gross_contracts=result.gross_contracts,
        gross_dv01=result.gross_dv01,
        residual_ratio=result.residual_ratio,
        within_tolerance=result.within_tolerance,
        margin_estimate=margin,
        contracts_detail=contracts_detail,
        warnings=result.warnings,
        assumptions=result.assumptions,
        scenarios=result.scenarios,
        factor_target=result.factor_target,
        factor_hedge=result.factor_hedge,
        factor_net=result.factor_net,
        effectiveness=result.effectiveness,
        rebalance=rebalance_out,
    )


@router.get('/instruments')
async def get_instruments():
    """List available Treasury futures with contract specs and key-rate DV01 profiles."""
    instruments = []
    for symbol, info in settings.FUTURES_CONTRACTS.items():
        instruments.append({
            'symbol': symbol,
            'name': info['name'],
            'tenor_mapping': info['tenor_mapping'],
            'contract_size': info['contract_size'],
            'dv01_approx': info['dv01_approx'],
            'tick_size': info['tick_size'],
            'key_rate_exposures': info.get('exposures', {}),
        })
    return {
        'success': True,
        'instruments': instruments,
        'note': (
            'DV01 values are approximate. '
            'Actual DV01 depends on CTD bond and conversion factor.'
        ),
    }


@router.get('/tenors')
async def get_hedging_tenors():
    """Return the 7-point key-rate tenor grid used by the hedge optimizer."""
    return {
        'success': True,
        'tenors': settings.KEY_RATE_TENORS,
        'note': (
            'These are the key-rate nodes at which DV01 exposure can be targeted. '
            'Aligns with the approximate key-rate exposure table for each futures contract.'
        ),
    }
