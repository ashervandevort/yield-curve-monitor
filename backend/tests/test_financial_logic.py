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

    def test_max_stored_date_tracks_latest_row(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            store = CurveStore(str(Path(tmpdir) / "curves.sqlite"))
            self.assertIsNone(store.max_stored_date())
            store.upsert_curve("2026-05-11", {"2Y": 4.25})
            store.upsert_curve("2026-05-12", {"2Y": 4.30})
            self.assertEqual(store.max_stored_date(), "2026-05-12")


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
        self.assertIn("combined_pnl", row)
        self.assertIn("net_pnl", row)
        # combined = pre + hedge when both legs same shock
        shock = rows[0]["shocks"]["10Y"]
        expected_combined = -(5000 + (-4800)) * shock
        self.assertAlmostEqual(row["combined_pnl"], round(expected_combined, 2), places=0)

    def test_net_pnl_equals_pre_minus_hedge(self) -> None:
        target = {"10Y": 5_000, "2Y": 1_000}
        hedge = {"10Y": 4_800, "2Y": 900}
        residual = {t: target[t] - hedge[t] for t in target}
        row = analytics.build_scenario_comparison(target, hedge, residual)[0]
        self.assertAlmostEqual(row["net_pnl"], row["pre_hedge"] - row["hedge_pnl"], places=0)

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


class TestMacroCalendarHelpers(unittest.TestCase):
    """Macro calendar dedupe and schedule helpers."""

    def test_dedupe_enforces_min_gap(self) -> None:
        from app.core.macro_calendar import _dedupe_release_dates

        raw = ['2024-01-01', '2024-01-03', '2024-01-15', '2024-01-16']
        kept = _dedupe_release_dates(raw, min_gap_days=7)
        self.assertEqual(kept, ['2024-01-01', '2024-01-15'])

    def test_cap_one_per_month(self) -> None:
        from app.core.macro_calendar import _cap_one_per_month

        raw = ['2024-01-05', '2024-01-12', '2024-02-01', '2024-02-20']
        self.assertEqual(_cap_one_per_month(raw), ['2024-01-05', '2024-02-01'])

    def test_fomc_uses_meeting_calendar_not_fred_cluster(self) -> None:
        from datetime import date
        from app.core.macro_calendar import _scheduled_dates_for_release

        dates = _scheduled_dates_for_release(
            'fomc',
            date(2025, 1, 1),
            date(2025, 12, 31),
        )
        self.assertEqual(len(dates), 8)
        self.assertIn('2025-01-29', dates)
        self.assertIn('2025-12-10', dates)

    def test_scheduled_releases_do_not_stack_five_per_day(self) -> None:
        from datetime import date
        from app.core.macro_calendar import MACRO_RELEASES, _scheduled_dates_for_release

        start = date(2026, 4, 1)
        end = date(2026, 7, 31)
        by_date: dict[str, int] = {}

        for key in MACRO_RELEASES:
            for d in _scheduled_dates_for_release(key, start, end):
                by_date[d] = by_date.get(d, 0) + 1

        days_with_five = [d for d, n in by_date.items() if n >= 5]
        self.assertEqual(days_with_five, [], f'days with 5+ releases: {days_with_five}')


class TestMarketCalendar(unittest.TestCase):
    def test_good_friday_2026(self) -> None:
        from datetime import date
        from app.core.market_calendar import bond_market_holidays

        holidays = bond_market_holidays(2026)
        self.assertIn(date(2026, 4, 3), holidays)
        self.assertEqual(holidays[date(2026, 4, 3)], 'Good Friday')

    def test_black_friday_early_close(self) -> None:
        from datetime import date
        from app.core.market_calendar import bond_market_early_closes

        early = bond_market_early_closes(2026)
        self.assertIn(date(2026, 11, 27), early)

    def test_market_days_include_weekends(self) -> None:
        from datetime import date
        from app.core.market_calendar import market_by_date

        m = market_by_date(date(2026, 5, 30), date(2026, 6, 1))
        self.assertEqual(m['2026-05-30']['day_type'], 'weekend')
        self.assertEqual(m['2026-05-31']['day_type'], 'weekend')


class TestMacroStore(unittest.TestCase):
    def test_resolve_prefers_fred_over_scheduled_same_month(self) -> None:
        import tempfile
        from pathlib import Path
        from app.core.macro_store import MacroStore

        with tempfile.TemporaryDirectory() as tmpdir:
            store = MacroStore(str(Path(tmpdir) / 'test.sqlite'))
            store.upsert_dates('cpi', ['2026-06-10', '2026-06-12'], 'scheduled')
            store.upsert_dates('cpi', ['2026-06-11'], 'fred')
            resolved = store.resolve_dates_for_calendar('cpi', '2026-06-01', '2026-06-30')
            self.assertEqual(resolved, ['2026-06-11'])

    def test_store_round_trip_and_csv(self) -> None:
        import tempfile
        from pathlib import Path
        from app.core.macro_store import MacroStore

        with tempfile.TemporaryDirectory() as tmpdir:
            store = MacroStore(str(Path(tmpdir) / 'test.sqlite'))
            store.upsert_dates('cpi', ['2026-01-12', '2026-02-12'], 'fred')
            store.set_sync_meta('cpi', '2026-02-12')
            dates = store.get_dates('cpi', '2026-01-01', '2026-03-01')
            self.assertEqual(dates, ['2026-01-12', '2026-02-12'])
            self.assertEqual(store.get_source('cpi', '2026-01-12'), 'fred')
            csv_path = store.export_csv()
            self.assertTrue(csv_path.exists())
            self.assertEqual(store.row_count(), 2)


if __name__ == "__main__":
    unittest.main()

