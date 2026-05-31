"""
Yield curve analytics: scenario P&L, factor exposures, hedge effectiveness.

All DV01 values are in dollars per basis point ($/bp).
P&L convention: positive = gain, negative = loss.
"""
from __future__ import annotations

import math
from typing import NamedTuple

from .config import settings

KEY_RATE_TENORS = settings.KEY_RATE_TENORS  # ['2Y','3Y','5Y','7Y','10Y','20Y','30Y']


# ── Tenor utilities ────────────────────────────────────────────────────────────

def _tenor_to_years(tenor: str) -> float:
    """Convert a tenor string like '10Y' or '3M' to fractional years."""
    if tenor.endswith('M'):
        return float(tenor[:-1]) / 12.0
    if tenor.endswith('Y'):
        return float(tenor[:-1])
    raise ValueError(f"Unknown tenor format: {tenor!r}")


TENOR_YEARS: dict[str, float] = {t: _tenor_to_years(t) for t in KEY_RATE_TENORS}


# ── Scenario definitions ───────────────────────────────────────────────────────

def _build_scenarios() -> dict[str, dict[str, float]]:
    """
    Build standard rate shock scenarios.

    Each scenario is a dict mapping tenor -> shock in basis points.
    Positive shock = rates rise; negative = rates fall.
    """
    tenors = KEY_RATE_TENORS
    y_min = TENOR_YEARS[tenors[0]]
    y_max = TENOR_YEARS[tenors[-1]]
    y_range = y_max - y_min

    def interp(t: str, short: float, long: float) -> float:
        """Linear interpolation from short-end to long-end value."""
        frac = (TENOR_YEARS[t] - y_min) / y_range
        return short + frac * (long - short)

    scenarios: dict[str, dict[str, float]] = {}

    for bp in (25, 50, 100, 200):
        scenarios[f'parallel_+{bp}'] = {t: float(bp) for t in tenors}
        scenarios[f'parallel_-{bp}'] = {t: float(-bp) for t in tenors}

    # Steepener: short end -12bp, long end +13bp (net ~0 at midpoint)
    scenarios['steepener_25'] = {t: round(interp(t, -12.5, 12.5), 2) for t in tenors}

    # Flattener: short end +12bp, long end -13bp
    scenarios['flattener_25'] = {t: round(interp(t, 12.5, -12.5), 2) for t in tenors}

    # Bear steepener: front end +0, long end rises to +50
    scenarios['bear_steepener'] = {t: round(max(0.0, interp(t, -5.0, 50.0)), 2) for t in tenors}

    # Bull flattener: short end -50, long end -10
    scenarios['bull_flattener'] = {t: round(interp(t, -50.0, -10.0), 2) for t in tenors}

    # Belly selloff: middle of the curve (5Y-10Y) rises ~25bp
    belly_vals = {'2Y': 0, '3Y': 5, '5Y': 15, '7Y': 25, '10Y': 20, '20Y': 10, '30Y': 0}
    scenarios['belly_selloff'] = {t: float(belly_vals.get(t, 0)) for t in tenors}

    # Belly rally: middle falls ~20bp
    scenarios['belly_rally'] = {t: -v for t, v in scenarios['belly_selloff'].items()}

    return scenarios


SCENARIOS: dict[str, dict[str, float]] = _build_scenarios()

SCENARIO_LABELS: dict[str, str] = {
    'parallel_+25':   'Fed +25bp (Hike)',
    'parallel_+50':   '+50bp Parallel',
    'parallel_+100':  '+100bp Parallel',
    'parallel_+200':  '+200bp Shock',
    'parallel_-25':   'Fed -25bp (Cut)',
    'parallel_-50':   '-50bp Parallel',
    'parallel_-100':  '-100bp Parallel',
    'parallel_-200':  '-200bp Shock',
    'steepener_25':   'Steepener (±12.5bp)',
    'flattener_25':   'Flattener (±12.5bp)',
    'bear_steepener': 'Bear Steepener',
    'bull_flattener': 'Bull Flattener',
    'belly_selloff':  'Belly Selloff',
    'belly_rally':    'Belly Rally',
}


# ── Factor weights ─────────────────────────────────────────────────────────────

def _build_factor_weights() -> tuple[dict[str, float], dict[str, float], dict[str, float]]:
    """
    Build level, slope, and curvature weights over KEY_RATE_TENORS.

    Level   : equal weight (sum)
    Slope   : normalised linear ramp from -1 at short end to +1 at long end,
              zero-summed so a parallel move has zero slope loading
    Curvature: convex (positive at wings, negative at belly), zero-summed
    """
    tenors = KEY_RATE_TENORS
    years = [TENOR_YEARS[t] for t in tenors]
    y_min, y_max = min(years), max(years)
    y_mid = (y_min + y_max) / 2.0

    level_w: dict[str, float] = {t: 1.0 for t in tenors}

    # Slope: linear ramp, normalised to max |weight| = 1
    raw_slope = {t: (TENOR_YEARS[t] - y_mid) for t in tenors}
    max_slope = max(abs(v) for v in raw_slope.values()) or 1.0
    slope_w = {t: v / max_slope for t, v in raw_slope.items()}

    # Curvature: parabolic wings-positive, normalised to max |weight| = 1
    raw_curv = {t: ((TENOR_YEARS[t] - y_mid) ** 2) for t in tenors}
    # Centre: set belly to negative by subtracting the average
    avg_curv = sum(raw_curv.values()) / len(tenors)
    raw_curv = {t: v - avg_curv for t, v in raw_curv.items()}
    max_curv = max(abs(v) for v in raw_curv.values()) or 1.0
    curv_w = {t: v / max_curv for t, v in raw_curv.items()}

    return level_w, slope_w, curv_w


LEVEL_WEIGHTS, SLOPE_WEIGHTS, CURVATURE_WEIGHTS = _build_factor_weights()


# ── Public API ─────────────────────────────────────────────────────────────────

class ScenarioResult(NamedTuple):
    name: str
    label: str
    shocks: dict[str, float]   # tenor -> bp shock
    pnl: float                  # $ P&L


class FactorExposures(NamedTuple):
    level: float      # $/bp (total DV01, direction-preserving)
    slope: float      # weighted: positive = long-end heavy
    curvature: float  # weighted: positive = wings heavy (barbell)


class HedgeEffectiveness(NamedTuple):
    effectiveness_pct: float   # 0–100 %
    dv01_reduction: float      # $/bp
    target_abs_dv01: float
    residual_abs_dv01: float


def compute_scenario_pnl(
    dv01_vector: dict[str, float],
    scenario_names: list[str] | None = None,
) -> list[ScenarioResult]:
    """
    Compute P&L for each scenario given a DV01 vector.

    Sign convention:
        positive DV01 = long duration; loses when rates rise.
        P&L = -sum(dv01[t] * shock_bp[t])
    """
    selected = scenario_names or list(SCENARIOS.keys())
    results: list[ScenarioResult] = []
    for name in selected:
        shocks = SCENARIOS.get(name, {})
        pnl = -sum(
            dv01_vector.get(t, 0.0) * shocks.get(t, 0.0)
            for t in KEY_RATE_TENORS
        )
        results.append(ScenarioResult(
            name=name,
            label=SCENARIO_LABELS.get(name, name),
            shocks=shocks,
            pnl=round(pnl, 2),
        ))
    return results


def compute_factors(dv01_vector: dict[str, float]) -> FactorExposures:
    """
    Decompose a DV01 vector into level / slope / curvature factor loadings.
    """
    level = sum(dv01_vector.get(t, 0.0) * LEVEL_WEIGHTS[t] for t in KEY_RATE_TENORS)
    slope = sum(dv01_vector.get(t, 0.0) * SLOPE_WEIGHTS[t] for t in KEY_RATE_TENORS)
    curv  = sum(dv01_vector.get(t, 0.0) * CURVATURE_WEIGHTS[t] for t in KEY_RATE_TENORS)
    return FactorExposures(
        level=round(level, 2),
        slope=round(slope, 2),
        curvature=round(curv, 2),
    )


def compute_effectiveness(
    target: dict[str, float],
    residual: dict[str, float],
) -> HedgeEffectiveness:
    """
    Compute hedge effectiveness as the fraction of DV01 risk eliminated.

    effectiveness = 1 - ||residual|| / ||target||
    """
    target_abs = sum(abs(v) for v in target.values())
    residual_abs = sum(abs(v) for v in residual.values())
    eff_pct = (1.0 - residual_abs / target_abs) * 100.0 if target_abs else 0.0
    return HedgeEffectiveness(
        effectiveness_pct=round(eff_pct, 2),
        dv01_reduction=round(target_abs - residual_abs, 2),
        target_abs_dv01=round(target_abs, 2),
        residual_abs_dv01=round(residual_abs, 2),
    )


def build_scenario_comparison(
    target_dv01: dict[str, float],
    hedge_dv01: dict[str, float],
    residual_dv01: dict[str, float],
) -> list[dict]:
    """
    Build a scenario P&L comparison table:
    pre-hedge (target), hedge-only, and net (residual) P&L for each scenario.
    """
    rows = []
    for name, shocks in SCENARIOS.items():
        pre  = -sum(target_dv01.get(t, 0.0)   * shocks.get(t, 0.0) for t in KEY_RATE_TENORS)
        hdg  = -sum(hedge_dv01.get(t, 0.0)    * shocks.get(t, 0.0) for t in KEY_RATE_TENORS)
        net  = -sum(residual_dv01.get(t, 0.0) * shocks.get(t, 0.0) for t in KEY_RATE_TENORS)
        rows.append({
            'name':      name,
            'label':     SCENARIO_LABELS.get(name, name),
            'shocks':    shocks,
            'pre_hedge': round(pre, 2),
            'hedge_pnl': round(hdg, 2),
            'net_pnl':   round(net, 2),
        })
    return rows
