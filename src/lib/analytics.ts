/**
 * Frontend financial analytics: DV01 conversions, unit display helpers.
 *
 * All DV01 values in $/bp (dollars per basis point).
 * Duration in years (modified duration).
 * Notional in dollars.
 */

import { KeyRateTenor, DisplayUnit, KEY_RATE_TENORS } from '@/types'

// ── Default approximate modified durations by key-rate tenor ──────────────────
// Used when a position leg does not override its duration.
// These are rough estimates for market-rate bonds; actual duration varies
// with coupon and current yield environment.
export const DEFAULT_MOD_DURATION: Record<KeyRateTenor, number> = {
  '2Y':  1.92,
  '3Y':  2.80,
  '5Y':  4.55,
  '7Y':  6.15,
  '10Y': 8.60,
  '20Y': 13.2,
  '30Y': 17.8,
}

// Per-contract DV01 for each futures instrument ($/bp) – from config
export const CONTRACT_DV01: Record<string, number> = {
  ZT:  38,
  ZF:  47,
  ZN:  78,
  TN:  95,
  ZB:  165,
  UB:  230,
}

// Nearest hedgeable instrument per key-rate tenor (for contracts display)
export const TENOR_TO_INSTRUMENT: Record<KeyRateTenor, string> = {
  '2Y':  'ZT',
  '3Y':  'ZF',
  '5Y':  'ZF',
  '7Y':  'ZN',
  '10Y': 'ZN',
  '20Y': 'ZB',
  '30Y': 'ZB',
}

// ── Core DV01 formula ─────────────────────────────────────────────────────────

/**
 * DV01 = notional × modDuration × 0.0001
 *
 * Positive for a long position (duration buyer),
 * negative for a short position (duration seller).
 */
export function dv01FromNotional(
  notional: number,
  modDuration: number,
  direction: 'long' | 'short' = 'long',
): number {
  const raw = notional * modDuration * 0.0001
  return direction === 'long' ? raw : -raw
}

/**
 * Invert: modDuration = DV01 / (notional × 0.0001)
 */
export function modDurationFromDv01(dv01: number, notional: number): number {
  if (notional === 0) return 0
  return Math.abs(dv01) / (notional * 0.0001)
}

// ── Unit conversions ──────────────────────────────────────────────────────────

/**
 * Convert a DV01 value to the requested display unit.
 *
 * @param dv01      Raw $/bp value
 * @param unit      Target display unit
 * @param notional  Portfolio notional (required for years_dur)
 * @param tenor     Key-rate tenor (for contracts mapping)
 */
export function convertUnit(
  dv01: number,
  unit: DisplayUnit,
  notional = 0,
  tenor?: KeyRateTenor,
): number {
  switch (unit) {
    case 'krd':
      return dv01

    case 'years_dur':
      return notional > 0 ? modDurationFromDv01(dv01, notional) * Math.sign(dv01) : 0

    case 'dollars_100bp':
      // P&L from a 100bp parallel move (sign: long loses when rates rise)
      return -dv01 * 100

    case 'contracts': {
      const inst = tenor ? TENOR_TO_INSTRUMENT[tenor] : undefined
      const perContract = inst ? CONTRACT_DV01[inst] : 0
      return perContract ? dv01 / perContract : 0
    }

    default:
      return dv01
  }
}

/**
 * Format a converted value with an appropriate suffix.
 */
export function formatUnit(value: number, unit: DisplayUnit): string {
  const sign = value > 0 ? '+' : ''
  switch (unit) {
    case 'krd': {
      const abs = Math.abs(value)
      if (abs >= 1_000_000) return `${sign}$${(value / 1_000_000).toFixed(2)}M/bp`
      if (abs >= 1_000)     return `${sign}$${(value / 1_000).toFixed(1)}k/bp`
      return `${sign}$${value.toFixed(0)}/bp`
    }
    case 'years_dur':
      return `${sign}${Math.abs(value).toFixed(2)}yr`
    case 'dollars_100bp': {
      const abs = Math.abs(value)
      if (abs >= 1_000_000) return `${sign}$${(value / 1_000_000).toFixed(2)}M`
      if (abs >= 1_000)     return `${sign}$${(value / 1_000).toFixed(1)}k`
      return `${sign}$${value.toFixed(0)}`
    }
    case 'contracts':
      return `${sign}${value.toFixed(1)}ct`
    default:
      return `${value.toFixed(2)}`
  }
}

// ── Position builder aggregation ──────────────────────────────────────────────

export interface PositionLegInput {
  notional: number
  tenor: KeyRateTenor
  modDuration: number
  direction: 'long' | 'short'
}

/**
 * Aggregate position legs into a 7-tenor DV01 vector.
 * Legs at the same tenor are summed.
 */
export function aggregateLegsToDv01(legs: PositionLegInput[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const t of KEY_RATE_TENORS) result[t] = 0
  for (const leg of legs) {
    result[leg.tenor] = (result[leg.tenor] ?? 0) + dv01FromNotional(
      leg.notional,
      leg.modDuration,
      leg.direction,
    )
  }
  return result
}

/**
 * Return only the non-zero tenors from a DV01 map.
 */
export function nonZeroTenors(dv01: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(dv01).filter(([, v]) => v !== 0))
}

// ── Scenario P&L (client-side preview) ───────────────────────────────────────

export function quickScenarioPnl(
  dv01: Record<string, number>,
  shocks: number,
): number {
  // P&L = -sum(dv01 * shock_bp) for parallel move
  return -Object.values(dv01).reduce((acc, v) => acc + v * shocks, 0)
}
