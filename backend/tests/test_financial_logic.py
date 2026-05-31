"""Focused tests for yield curve, hedging, and analytics logic."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

from app.api.v1.curve import parse_tenors, parse_windows, validate_date_range
from app.core.curve_store import CurveStore
from app.core.hedging import HedgingOptimizer
from app.core import analytics


# ── Curve API validation ───────────────────────────────────────────────────────

class CurveValidationTests(unittest.TestCase):

    def test_parse_tenors_rejects_unknown_tenor(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            parse_tenors("2Y,11Y", "full")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_parse_windows_rejects_unknown_window(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            parse_windows("1D,2Y")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_validate_date_range_rejects_reversed_dates(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            validate_date_range("2026-05-12", "2026-01-01")
        self.assertEqual(ctx.exception.status_code, 400)


# ── CurveStore ─────────────────────────────────────────────────────────────────

class CurveStoreTests(unittest.TestCase):

    def test_store_round_trips_latest_curve_and_history(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            store = CurveStore(str(Path(tmpdir) / "curves.sqlite"))
            store.upsert_curve("2026-05-11", {"2Y": 4.25, "10Y": 4.65})
            store.upsert_curve("2026-05-12", {"2Y": 4.30, "10Y": 4.70})

            latest = store.latest_curve(["2Y", "10Y"])
            self.assertIsNotNone(latest)
            assert latest is not None
            self.assertEqual(latest.date, "2026-05-12")
            self.assertAlmostEqual(latest.yields["10Y"], 4.70)

            history = store.curve_history("2026-05-01", "2026-05-31", ["2Y", "10Y"])
            self.assertEqual(len(history), 2)
            self.assertIn("2Y", history.columns)


# ── HedgingOptimizer (7-tenor) ────────────────────────────────────────────────

class HedgingOptimizerTests(unittest.TestCase):

    def setUp(self) -> None:
        self.optimizer = HedgingOptimizer()

    def test_optimizer_uses_7_tenor_grid(self) -> None:
        self.assertEqual(len(self.optimizer.tenors), 7)
        self.assertEqual(self.optimizer.tenors, ['2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'])

    def test_exposure_matrix_shape(self) -> None:
        A = self.optimizer.get_exposure_matrix(['ZT', 'ZN', 'ZB'])
        self.assertEqual(A.shape, (7, 3))

    def test_zn_has_cross_tenor_exposure(self) -> None:
        A = self.optimizer.get_exposure_matrix(["ZN"])
        five_y  = self.optimizer.tenors.index("5Y")
        ten_y   = self.optimizer.tenors.index("10Y")
        self.assertGreater(A[five_y, 0], 0)
        self.assertGreater(A[ten_y, 0], 0)

    def test_optimize_10y_target(self) -> None:
        result = self.optimizer.optimize(
            target_dv01={"10Y": 7_800},
            instruments=["ZN"],
            max_contracts=200,
            residual_tolerance=500,
        )
        self.assertIn("ZN", result.contracts)
        self.assertGreater(result.gross_contracts, 0)
        self.assertGreaterEqual(result.residual_ratio, 0)
        self.assertTrue(result.assumptions)

    def test_optimize_multi_tenor_hedge(self) -> None:
        result = self.optimizer.optimize(
            target_dv01={"2Y": 50_000, "10Y": -30_000, "30Y": -20_000},
            instruments=["ZT", "ZN", "ZB"],
            max_contracts=1_000,
        )
        self.assertTrue(result.success if hasattr(result, "success") else True)
        self.assertIsInstance(result.contracts, dict)
        self.assertGreaterEqual(len(result.contracts), 1)

    def test_rebalancing_computes_delta(self) -> None:
        result = self.optimizer.optimize(
            target_dv01={"10Y": 10_000},
            instruments=["ZN"],
            current_positions={"ZN": 50},
        )
        self.assertIsNotNone(result.rebalance)
        assert result.rebalance is not None
        self.assertIn("ZN", result.rebalance.delta)
        # Delta should be non-zero (optimal != 50 for this target)

    def test_scenarios_attached_to_result(self) -> None:
        result = self.optimizer.optimize(
            target_dv01={"10Y": 5_000, "30Y": 3_000},
            instruments=["ZN", "ZB"],
        )
        self.assertIsInstance(result.scenarios, list)
        self.assertGreater(len(result.scenarios), 0)
        row = result.scenarios[0]
        self.assertIn("name", row)
        self.assertIn("pre_hedge", row)
        self.assertIn("net_pnl", row)

    def test_factor_exposures_attached_to_result(self) -> None:
        result = self.optimizer.optimize(
            target_dv01={"5Y": 20_000, "10Y": -15_000},
            instruments=["ZF", "ZN"],
        )
        self.assertIn("level", result.factor_target)
        self.assertIn("slope", result.factor_target)
        self.assertIn("curvature", result.factor_target)

    def test_effectiveness_metrics_attached(self) -> None:
        result = self.optimizer.optimize(
            target_dv01={"10Y": 7_800},
            instruments=["ZN"],
        )
        eff = result.effectiveness
        self.assertIn("effectiveness_pct", eff)
        self.assertGreaterEqual(eff["effectiveness_pct"], 0)
        self.assertLessEqual(eff["effectiveness_pct"], 100)


# ── Analytics module ───────────────────────────────────────────────────────────

class AnalyticsTests(unittest.TestCase):

    def test_scenario_pnl_parallel_move(self) -> None:
        dv01 = {"10Y": 10_000}
        results = analytics.compute_scenario_pnl(dv01, ["parallel_+25"])
        self.assertEqual(len(results), 1)
        pnl = results[0].pnl
        # Long 10Y DV01, rates rise 25bp → lose $250k
        self.assertAlmostEqual(pnl, -250_000, delta=1)

    def test_scenario_pnl_short_duration(self) -> None:
        dv01 = {"10Y": -10_000}  # short duration
        results = analytics.compute_scenario_pnl(dv01, ["parallel_+25"])
        pnl = results[0].pnl
        # Short duration profits when rates rise
        self.assertGreater(pnl, 0)

    def test_factor_level_equals_sum(self) -> None:
        dv01 = {t: 1_000.0 for t in analytics.KEY_RATE_TENORS}
        factors = analytics.compute_factors(dv01)
        # Level should equal sum (all weights = 1.0)
        expected = sum(dv01.values())
        self.assertAlmostEqual(factors.level, expected, delta=1)

    def test_factor_slope_direction(self) -> None:
        # Long only at 30Y should have positive slope (long-end heavy)
        dv01_long = {t: 0.0 for t in analytics.KEY_RATE_TENORS}
        dv01_long["30Y"] = 10_000.0
        factors_long = analytics.compute_factors(dv01_long)
        self.assertGreater(factors_long.slope, 0)

        # Long only at 2Y should have negative slope (short-end heavy)
        dv01_short = {t: 0.0 for t in analytics.KEY_RATE_TENORS}
        dv01_short["2Y"] = 10_000.0
        factors_short = analytics.compute_factors(dv01_short)
        self.assertLess(factors_short.slope, 0)

    def test_effectiveness_100pct_for_perfect_hedge(self) -> None:
        target = {"10Y": 10_000}
        residual = {"10Y": 0.0}
        eff = analytics.compute_effectiveness(target, residual)
        self.assertAlmostEqual(eff.effectiveness_pct, 100.0, delta=0.01)

    def test_effectiveness_0pct_for_no_hedge(self) -> None:
        target = {"10Y": 10_000}
        residual = {"10Y": 10_000}
        eff = analytics.compute_effectiveness(target, residual)
        self.assertAlmostEqual(eff.effectiveness_pct, 0.0, delta=0.01)

    def test_build_scenario_comparison_structure(self) -> None:
        target  = {"10Y": 5_000}
        hedge   = {"10Y": -4_800}
        net     = {"10Y": 200}
        rows = analytics.build_scenario_comparison(target, hedge, net)
        self.assertGreater(len(rows), 0)
        row = rows[0]
        self.assertIn("pre_hedge", row)
        self.assertIn("hedge_pnl", row)
        self.assertIn("net_pnl", row)

    def test_all_standard_scenarios_present(self) -> None:
        expected = {
            'parallel_+25', 'parallel_+50', 'parallel_+100', 'parallel_+200',
            'parallel_-25', 'parallel_-50', 'parallel_-100', 'parallel_-200',
            'steepener_25', 'flattener_25',
            'bear_steepener', 'bull_flattener',
            'belly_selloff', 'belly_rally',
        }
        self.assertEqual(set(analytics.SCENARIOS.keys()), expected)

    def test_scenarios_cover_all_key_rate_tenors(self) -> None:
        for name, shocks in analytics.SCENARIOS.items():
            for tenor in analytics.KEY_RATE_TENORS:
                self.assertIn(
                    tenor, shocks,
                    f"Scenario '{name}' missing tenor '{tenor}'",
                )


if __name__ == "__main__":
    unittest.main()
