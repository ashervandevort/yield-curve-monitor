/**
 * TypeScript types for Yield Curve Monitor
 */

// ── Tenor types ────────────────────────────────────────────────────────────────

export type Tenor =
  | '1M' | '2M' | '3M' | '4M' | '6M'
  | '1Y' | '2Y' | '3Y' | '5Y' | '7Y' | '10Y' | '20Y' | '30Y'

/** Tenors available for the "futures curve" chart view */
export type FuturesTenor = '2Y' | '5Y' | '10Y' | '30Y'

/** 7-point key-rate DV01 tenor grid used by the hedge optimizer */
export type KeyRateTenor = '2Y' | '3Y' | '5Y' | '7Y' | '10Y' | '20Y' | '30Y'

export type TimeWindow = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y'
export type CurveType = 'full' | 'futures'

/** Display unit for DV01/risk tables */
export type DisplayUnit = 'krd' | 'years_dur' | 'dollars_100bp' | 'contracts'

// ── Yield curve ────────────────────────────────────────────────────────────────

export interface YieldPoint {
  tenor: Tenor
  yield: number
}

export interface YieldCurve {
  date: string
  yields: Record<string, number>
  metadata?: CurveMetadata
}

export interface CurveMetadata {
  source: string
  fetched_at?: string | null
  cache_status: 'hit' | 'refreshed' | 'stale_fallback' | 'miss'
  cache_age_hours?: number | null
  missing_tenors: string[]
  is_partial: boolean
  stale?: boolean
}

export interface HistoricalPoint {
  date: string
  [key: string]: string | number | null
}

export interface YieldChange {
  tenor: string
  change: number
}

export interface ChangeWindow {
  from_date: string
  to_date: string
  changes: Record<string, number>
}

// ── Spreads ────────────────────────────────────────────────────────────────────

export interface Spread {
  value: number
  description: string
  interpretation: 'steepening' | 'inverted' | 'normal'
}

export interface SpreadsData {
  date: string
  spreads: {
    '2s10s'?:    Spread
    '5s30s'?:    Spread
    '3m10y'?:    Spread
    '2s30s'?:    Spread
    '2s5s'?:     Spread
    '5s10s30s'?: Spread
    '2s5s10s'?:  Spread
  }
  yields: Record<string, number>
  regime?: CurveRegime
}

export interface CurveRegime {
  level: number       // average yield (%)
  slope: number       // 10Y - 2Y (bp)
  curvature: number   // (2Y + 30Y)/2 - 10Y (bp)
  label: string
}

// ── Futures & hedge ────────────────────────────────────────────────────────────

export interface FuturesContract {
  symbol: string
  name: string
  tenor_mapping: FuturesTenor
  contract_size: number
  dv01_approx: number
  tick_size: number
  key_rate_exposures: Record<string, number>
}

// Position-builder leg: notional + key-rate + duration
export interface PositionLeg {
  id: string
  notional: number
  tenor: KeyRateTenor
  modDuration: number     // modified duration in years (auto-filled or overridden)
  durationOverride: boolean
  direction: 'long' | 'short'
}

export interface HedgeRequest {
  target_dv01: Record<string, number>
  instruments?: string[]
  max_contracts?: number
  penalty_per_contract?: number
  residual_tolerance?: number
  current_positions?: Record<string, number>
}

// Scenario P&L row
export interface ScenarioRow {
  name: string
  label: string
  shocks: Record<string, number>
  pre_hedge: number
  hedge_pnl: number
  net_pnl: number
}

// Factor exposures
export interface FactorExposures {
  level: number
  slope: number
  curvature: number
}

// Hedge effectiveness
export interface HedgeEffectiveness {
  effectiveness_pct: number
  dv01_reduction: number
  target_abs_dv01: number
  residual_abs_dv01: number
}

// Rebalancing
export interface RebalanceInfo {
  delta: Record<string, number>
  turnover_contracts: number
  closed_positions: string[]
  turnover_margin_estimate: number
}

// Per-contract detail
export interface ContractDetail {
  symbol: string
  name: string
  contracts: number
  dv01_per_contract: number
  total_dv01: number
  notional_face: number
  margin_per_contract: number
  total_margin: number
  key_rate_exposures: Record<string, number>
  direction: 'LONG' | 'SHORT'
}

export interface HedgeResult {
  success: boolean
  contracts: Record<string, number>
  achieved_dv01: Record<string, number>
  target_dv01: Record<string, number>
  residual: Record<string, number>
  total_residual: number
  gross_contracts: number
  gross_dv01: number
  residual_ratio: number
  within_tolerance: boolean
  margin_estimate: number
  contracts_detail: ContractDetail[]
  warnings: string[]
  assumptions: string[]
  scenarios: ScenarioRow[]
  factor_target: FactorExposures
  factor_hedge: FactorExposures
  factor_net: FactorExposures
  effectiveness: HedgeEffectiveness
  rebalance: RebalanceInfo | null
}

// ── Chart data ─────────────────────────────────────────────────────────────────

export interface CurveChartData {
  tenor: string
  tenorNumeric: number
  yield: number
  label: string
}

export interface OverlayCurve {
  id: string
  label: string
  color: string
  data: CurveChartData[]
}

export interface HeatmapCell {
  tenor: string
  window: TimeWindow
  value: number
}

// ── API response ───────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const TENOR_ORDER: Tenor[] = [
  '1M', '2M', '3M', '4M', '6M',
  '1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y',
]

export const FUTURES_TENOR_ORDER: FuturesTenor[] = ['2Y', '5Y', '10Y', '30Y']

export const KEY_RATE_TENORS: KeyRateTenor[] = [
  '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y',
]

export const tenorToYears: Record<string, number> = {
  '1M':  1 / 12,
  '2M':  2 / 12,
  '3M':  3 / 12,
  '4M':  4 / 12,
  '6M':  6 / 12,
  '1Y':  1,
  '2Y':  2,
  '3Y':  3,
  '5Y':  5,
  '7Y':  7,
  '10Y': 10,
  '20Y': 20,
  '30Y': 30,
}

export const CURVE_COLORS = {
  today: '#00cccc',
  '1D':  '#ff9900',
  '1W':  '#ff6666',
  '1M':  '#9966ff',
  '1Y':  '#66cc66',
} as const

// Heatmap colour helpers
export function getHeatmapColor(value: number): string {
  if (value <= -30) return '#7a0000'
  if (value <= -20) return '#bb2222'
  if (value <= -10) return '#ee5555'
  if (value <  -5)  return '#cc8888'
  if (value <=  5)  return '#1a2232'
  if (value <  10)  return '#006644'
  if (value <  20)  return '#005533'
  if (value <  30)  return '#004422'
  return '#003311'
}

export function getChangeTextColor(value: number): string {
  if (value > 0) return '#00cc66'
  if (value < 0) return '#ff3333'
  return 'rgba(255,255,255,0.35)'
}

export function formatBasisPoints(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)} bp`
}

export function formatYield(value: number): string {
  return `${value.toFixed(3)}%`
}

// Display-unit label helpers
export const DISPLAY_UNIT_LABELS: Record<DisplayUnit, string> = {
  krd:           'KRD $/bp',
  years_dur:     'Yrs Dur',
  dollars_100bp: '$100bp',
  contracts:     'Contracts',
}
