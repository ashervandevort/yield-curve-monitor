export type HistoryWindow = '1Y' | '5Y' | '10Y'

export function historyWindowDays(window: HistoryWindow): number {
  if (window === '1Y') return 365
  if (window === '5Y') return 1825
  return 3650
}

export function subtractDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T12:00:00')
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Empirical percentile rank: share of history at or below current (0–100). */
export function percentileRank(history: number[], current: number): number {
  if (!history.length) return NaN
  const below = history.filter((v) => v <= current).length
  return (below / history.length) * 100
}

export function zScore(history: number[], current: number): number {
  if (history.length < 2) return NaN
  const mean = history.reduce((a, b) => a + b, 0) / history.length
  const variance = history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length
  const std = Math.sqrt(variance) || 1e-9
  return (current - mean) / std
}

export function formatPercentile(pct: number): string {
  if (!Number.isFinite(pct)) return '—'
  const rounded = Math.round(pct)
  const mod100 = rounded % 100
  const mod10 = rounded % 10
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : mod10 === 1
        ? 'st'
        : mod10 === 2
          ? 'nd'
          : mod10 === 3
            ? 'rd'
            : 'th'
  return `${rounded}${suffix}`
}

/** Downsample series for sparklines (max points). */
export function downsample(values: number[], maxPoints = 48): number[] {
  if (values.length <= maxPoints) return values
  const step = values.length / maxPoints
  const out: number[] = []
  for (let i = 0; i < maxPoints; i++) {
    out.push(values[Math.floor(i * step)])
  }
  return out
}

/** Color for percentile rank: low yields → teal, mid → orange, high → red */
export function percentileColor(pct: number): string {
  const p = Math.min(100, Math.max(0, pct))
  if (p <= 50) {
    const t = p / 50
    const r = Math.round(10 + t * (255 - 10))
    const g = Math.round(77 + t * (102 - 77))
    const b = Math.round(58 + t * (0 - 58))
    return `rgb(${r},${g},${b})`
  }
  const t = (p - 50) / 50
  const r = Math.round(255)
  const g = Math.round(102 - t * 102)
  const b = Math.round(0 + t * (51 - 0))
  return `rgb(${r},${g},${b})`
}
