/**
 * Generate a plain-text market write-up from curve, spread, and macro data.
 */
import {
  MacroRelease,
  MarketDay,
  SpreadsData,
  TimeWindow,
  TENOR_ORDER,
  FUTURES_CONTRACTS,
} from '@/types'

export type WriteUpPeriod = TimeWindow
export type MacroWriteUpMode = 'off' | 'past_week' | 'upcoming_week'

export interface WriteUpInput {
  curveDate: string
  curveType: 'full' | 'futures'
  yields: Record<string, number>
  changes: Record<string, { from_date: string; to_date: string; changes: Record<string, number> }>
  spreads: SpreadsData & { regime?: { level: number; slope: number; curvature: number; label: string } }
  period: WriteUpPeriod
  macroMode: MacroWriteUpMode
  macroEvents?: MacroRelease[]
  marketDays?: MarketDay[]
}

const PERIOD_LABEL: Record<WriteUpPeriod, string> = {
  '1D': 'the past session',
  '1W': 'the past week',
  '1M': 'the past month',
  '3M': 'the past three months',
  '6M': 'the past six months',
  '1Y': 'the past year',
}

const KEY_TENORS = ['2Y', '5Y', '10Y', '30Y']

function fmtBp(v: number): string {
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(0)} bp`
}

function directionWord(v: number): string {
  if (v > 3) return 'rose'
  if (v < -3) return 'fell'
  return 'was little changed'
}

function spreadSentence(key: string, value: number, interpretation: string): string {
  const state =
    interpretation === 'inverted' ? 'inverted' : interpretation === 'steepening' ? 'steep' : 'moderately positive'
  return `${key} at ${value > 0 ? '+' : ''}${value.toFixed(1)} bp (${state})`
}

function macroLines(events: MacroRelease[], heading: string): string[] {
  if (!events.length) return [`${heading}: none in range.`]
  return [
    heading + ':',
    ...events.map(
      (e) =>
        `  • ${e.day_of_week ?? ''} ${e.date}${e.release_time_label ? ` · ${e.release_time_label}` : ''} — ${e.name}`,
    ),
  ]
}

function marketHolidayLines(days: MarketDay[]): string[] {
  const notable = days.filter((d) => d.day_type === 'closed' || d.day_type === 'early_close')
  if (!notable.length) return []
  return [
    'Market schedule:',
    ...notable.map((d) => {
      const suffix = d.day_type === 'early_close' ? ' (early close 2:00 PM ET)' : ' (closed)'
      return `  • ${d.date} — ${d.name}${suffix}`
    }),
  ]
}

export function buildCurveWriteUp(input: WriteUpInput): string {
  const window = input.changes[input.period]
  const periodLabel = PERIOD_LABEL[input.period]
  const lines: string[] = []

  lines.push(`Treasury Yield Curve — ${input.curveDate}`)
  lines.push(`Curve view: ${input.curveType === 'futures' ? 'Treasury futures (CTD yields)' : 'spot constant maturity'}`)
  lines.push('')

  if (input.spreads.regime) {
    const r = input.spreads.regime
    const y2 = input.yields['2Y']
    const y10 = input.yields['10Y']
    const y30 = input.yields['30Y']
    const bfly =
      y2 !== undefined && y10 !== undefined && y30 !== undefined
        ? ` (2s10s30s: (${y2.toFixed(2)}+${y30.toFixed(2)})/2 − ${y10.toFixed(2)} = ${r.curvature.toFixed(0)} bp)`
        : ''
    lines.push(
      `Regime: ${r.label} · avg level ${r.level.toFixed(2)}% · ` +
        `2s10s slope ${r.slope.toFixed(0)} bp · 2s10s30s butterfly ${r.curvature.toFixed(0)} bp${bfly}`,
    )
    lines.push('')
  }

  const spreadBits = ['2s10s', '3m10y', '5s30s']
    .map((k) => {
      const s = input.spreads.spreads[k as keyof typeof input.spreads.spreads]
      return s ? spreadSentence(k, s.value, s.interpretation) : null
    })
    .filter(Boolean)
  if (spreadBits.length) {
    lines.push(`Key spreads (${input.spreads.date}): ${spreadBits.join('; ')}.`)
    lines.push('')
  }

  if (window) {
    lines.push(`Curve moves over ${periodLabel} (${window.from_date} → ${window.to_date}):`)

    const tenors =
      input.curveType === 'futures'
        ? FUTURES_CONTRACTS.map((c) => ({ label: c.symbol, key: c.tenor }))
        : KEY_TENORS.map((t) => ({ label: t, key: t }))

    for (const { label, key } of tenors) {
      const ch = window.changes[key]
      if (ch === undefined || ch === null) continue
      const y = input.yields[key]
      lines.push(
        `  • ${label}: ${directionWord(ch)} ${fmtBp(ch)}` +
          (y !== undefined ? ` · closing ${y.toFixed(2)}%` : ''),
      )
    }

    const allChanges = TENOR_ORDER.map((t) => window.changes[t]).filter((v) => v != null) as number[]
    if (allChanges.length && input.curveType === 'full') {
      const avg = allChanges.reduce((a, b) => a + b, 0) / allChanges.length
      const maxTenor = TENOR_ORDER.reduce(
        (best, t) => {
          const v = window.changes[t]
          if (v == null) return best
          return Math.abs(v) > Math.abs(best.v) ? { t, v } : best
        },
        { t: '', v: 0 },
      )
      lines.push(
        `  • Parallel-ish avg move: ${fmtBp(avg)} · largest move at ${maxTenor.t}: ${fmtBp(maxTenor.v)}`,
      )
    }
    lines.push('')
  } else {
    lines.push(`No ${input.period} change window available.`)
    lines.push('')
  }

  if (input.macroMode !== 'off' && input.macroEvents) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const filtered = input.macroEvents.filter((e) => {
      const d = new Date(e.date + 'T12:00:00')
      const diff = (d.getTime() - today.getTime()) / 86400000
      if (input.macroMode === 'past_week') return diff < 0 && diff >= -7
      return diff >= 0 && diff <= 7
    })
    lines.push(...macroLines(filtered, input.macroMode === 'past_week' ? 'Macro (past 7 days)' : 'Macro (next 7 days)'))
    lines.push('')
  }

  if (input.marketDays?.length && input.macroMode !== 'off') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekStart = new Date(today)
    weekStart.setDate(weekStart.getDate() - 7)
    const inRange = input.marketDays.filter((d) => {
      const dt = new Date(d.date + 'T12:00:00')
      if (input.macroMode === 'past_week') return dt >= weekStart && dt <= today
      return dt >= today && dt <= weekEnd
    })
    lines.push(...marketHolidayLines(inRange))
    lines.push('')
  }

  lines.push('Source: FRED daily closes · 252.capital Yield Curve Monitor')
  return lines.join('\n')
}
