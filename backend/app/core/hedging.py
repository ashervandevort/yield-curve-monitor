"""Hedging optimizer for Treasury futures – 7-point key-rate DV01 model."""
from __future__ import annotations

import numpy as np
from scipy.optimize import minimize
from typing import Optional
from dataclasses import dataclass, field

from .config import settings
from .analytics import (
    build_scenario_comparison,
    compute_factors,
    compute_effectiveness,
    FactorExposures,
    HedgeEffectiveness,
    KEY_RATE_TENORS,
)


@dataclass
class RebalanceSummary:
    """Delta trades needed to move from current positions to the optimal hedge."""
    delta: dict[str, int]         # instrument -> contracts to trade (+ = buy, - = sell)
    turnover_contracts: int       # total contracts traded (gross)
    closed_positions: list[str]   # instruments being fully closed


@dataclass
class HedgeResult:
    """Full result from a hedge optimisation run."""
    contracts: dict[str, int]
    achieved_dv01: dict[str, float]
    target_dv01: dict[str, float]
    residual: dict[str, float]
    total_residual: float
    gross_contracts: int
    gross_dv01: float
    residual_ratio: float
    within_tolerance: bool
    warnings: list[str]
    assumptions: list[str]
    # Analytics (populated after optimisation)
    scenarios: list[dict] = field(default_factory=list)
    factor_target: dict[str, float] = field(default_factory=dict)
    factor_hedge: dict[str, float] = field(default_factory=dict)
    factor_net: dict[str, float] = field(default_factory=dict)
    effectiveness: dict[str, float] = field(default_factory=dict)
    rebalance: Optional[RebalanceSummary] = None


class HedgingOptimizer:
    """
    Optimise Treasury futures positions to match a target key-rate DV01 profile.

    Uses unconstrained least-squares (L-BFGS-B) over the 7-tenor key-rate grid,
    then integer-rounds and computes scenario / factor analytics.
    """

    def __init__(self):
        self.futures = settings.FUTURES_CONTRACTS
        self.tenors  = settings.KEY_RATE_TENORS   # 7-point grid

    # ── Exposure matrix ────────────────────────────────────────────────────────

    def get_exposure_matrix(self, instruments: list[str]) -> np.ndarray:
        """
        Build the DV01 exposure matrix A (n_tenors × n_instruments).

        A[i, j] = approximate key-rate DV01 of instrument j at tenor i ($/bp).
        """
        n_t = len(self.tenors)
        n_i = len(instruments)
        A = np.zeros((n_t, n_i))

        for j, inst in enumerate(instruments):
            if inst not in self.futures:
                continue
            exposures: dict[str, float] = self.futures[inst].get('exposures', {})
            for tenor, dv01 in exposures.items():
                if tenor in self.tenors:
                    i = self.tenors.index(tenor)
                    A[i, j] = float(dv01)

        return A

    # ── Core optimisation ─────────────────────────────────────────────────────

    def optimize(
        self,
        target_dv01: dict[str, float],
        instruments: Optional[list[str]] = None,
        max_contracts: int = 1000,
        round_to_int: bool = True,
        penalty_per_contract: float = 0.0,
        residual_tolerance: float = 1_000.0,
        current_positions: Optional[dict[str, int]] = None,
    ) -> HedgeResult:
        """
        Optimise futures positions to match the target DV01 profile.

        Args:
            target_dv01:        Dict mapping tenor → target DV01 ($/bp).
            instruments:        Futures to include; defaults to all.
            max_contracts:      Per-instrument absolute bound.
            round_to_int:       Round continuous solution to integers.
            penalty_per_contract: Complexity penalty on gross contract count.
            residual_tolerance: Per-tenor DV01 tolerance for warning flags.
            current_positions:  Existing book; if provided, computes delta trades.

        Returns:
            HedgeResult with positions, analytics, and optional rebalancing info.
        """
        instruments = instruments or list(self.futures.keys())

        # Target vector aligned with self.tenors
        target_vec = np.array([target_dv01.get(t, 0.0) for t in self.tenors])

        A = self.get_exposure_matrix(instruments)
        n = len(instruments)

        def objective(x: np.ndarray) -> float:
            achieved = A @ x
            residual_sq = float(np.sum((achieved - target_vec) ** 2))
            complexity  = penalty_per_contract * float(np.sum(np.abs(x)))
            return residual_sq + complexity

        bounds = [(-max_contracts, max_contracts)] * n
        result = minimize(objective, np.zeros(n), method='L-BFGS-B', bounds=bounds)

        opt_x = result.x
        if round_to_int:
            opt_x = np.round(opt_x).astype(int)

        achieved_vec = A @ opt_x

        contracts = {
            inst: int(opt_x[j])
            for j, inst in enumerate(instruments)
            if opt_x[j] != 0
        }

        achieved_dv01 = {t: float(achieved_vec[i]) for i, t in enumerate(self.tenors)}
        target_dv01_full = {t: float(target_vec[i]) for i, t in enumerate(self.tenors)}
        residual = {t: float(target_vec[i] - achieved_vec[i]) for i, t in enumerate(self.tenors)}

        total_residual = float(np.sum(np.abs(target_vec - achieved_vec)))
        target_abs     = float(np.sum(np.abs(target_vec)))
        gross_contracts = int(np.sum(np.abs(opt_x)))
        gross_dv01      = float(np.sum(np.abs(achieved_vec)))
        residual_ratio  = total_residual / target_abs if target_abs else 0.0
        within_tolerance = all(abs(v) <= residual_tolerance for v in residual.values())

        warnings: list[str] = []
        if not result.success:
            warnings.append("Continuous optimizer did not fully converge before integer rounding.")
        if not within_tolerance:
            warnings.append("Residual DV01 exceeds the configured tolerance at one or more tenors.")
        if np.any(np.abs(opt_x) >= max_contracts):
            warnings.append("At least one instrument hit the max-contract bound.")
        if target_abs > 1_000_000:
            warnings.append("Large target DV01 entered; validate liquidity, margin, and execution capacity.")

        assumptions = [
            "Approximate key-rate DV01 exposures from static table (not recalculated daily).",
            "CTD bond, conversion factor, and futures basis are not dynamically recalculated.",
            "Integer rounding applied after continuous least-squares optimisation.",
        ]

        # ── Analytics ─────────────────────────────────────────────────────────

        # Hedge DV01 = achieved (what the futures deliver)
        hedge_dv01 = achieved_dv01

        scenarios = build_scenario_comparison(target_dv01_full, hedge_dv01, residual)

        f_target = compute_factors(target_dv01_full)
        f_hedge  = compute_factors(hedge_dv01)
        f_net    = compute_factors(residual)

        effectiveness = compute_effectiveness(target_dv01_full, residual)

        # ── Rebalancing ────────────────────────────────────────────────────────

        rebalance: Optional[RebalanceSummary] = None
        if current_positions is not None:
            delta: dict[str, int] = {}

            # Trade into optimal positions
            for inst, opt_count in contracts.items():
                curr = current_positions.get(inst, 0)
                if opt_count != curr:
                    delta[inst] = opt_count - curr

            # Close positions that are no longer in the optimal set
            closed: list[str] = []
            for inst, curr_count in current_positions.items():
                if inst not in contracts and curr_count != 0:
                    delta[inst] = -curr_count
                    closed.append(inst)

            turnover = sum(abs(v) for v in delta.values())
            rebalance = RebalanceSummary(
                delta=delta,
                turnover_contracts=turnover,
                closed_positions=closed,
            )

        return HedgeResult(
            contracts=contracts,
            achieved_dv01=achieved_dv01,
            target_dv01=target_dv01_full,
            residual=residual,
            total_residual=total_residual,
            gross_contracts=gross_contracts,
            gross_dv01=gross_dv01,
            residual_ratio=float(residual_ratio),
            within_tolerance=within_tolerance,
            warnings=warnings,
            assumptions=assumptions,
            scenarios=scenarios,
            factor_target={'level': f_target.level, 'slope': f_target.slope, 'curvature': f_target.curvature},
            factor_hedge={'level': f_hedge.level, 'slope': f_hedge.slope, 'curvature': f_hedge.curvature},
            factor_net={'level': f_net.level, 'slope': f_net.slope, 'curvature': f_net.curvature},
            effectiveness={
                'effectiveness_pct': effectiveness.effectiveness_pct,
                'dv01_reduction': effectiveness.dv01_reduction,
                'target_abs_dv01': effectiveness.target_abs_dv01,
                'residual_abs_dv01': effectiveness.residual_abs_dv01,
            },
            rebalance=rebalance,
        )

    # ── Helpers ────────────────────────────────────────────────────────────────

    def get_contract_info(self, contract: str) -> dict:
        return self.futures.get(contract, {})

    def calculate_margin_estimate(self, contracts: dict[str, int]) -> float:
        """Rough initial-margin estimate. Actual margin is SPAN-based."""
        margin_per_contract = {
            'ZT': 550,
            'ZF': 850,
            'ZN': 1_350,
            'TN': 1_700,
            'ZB': 2_800,
            'UB': 3_500,
        }
        return sum(abs(count) * margin_per_contract.get(inst, 2_000)
                   for inst, count in contracts.items())


# Singleton
hedging_optimizer = HedgingOptimizer()
