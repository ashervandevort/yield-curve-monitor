/**
 * Shared utility functions
 */

/** Merge class names, filtering falsy values */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

/** Format a number with sign prefix */
export function formatSigned(value: number, decimals = 0): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}`
}

/** Format basis points */
export function formatBp(value: number, decimals = 1): string {
  return `${formatSigned(value, decimals)} bp`
}

/** Format dollars (compact) */
export function formatDollars(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`
  return `${sign}$${abs.toFixed(0)}`
}

/** Format dollars per basis point */
export function formatDv01(value: number): string {
  const sign = value > 0 ? '+' : ''
  if (Math.abs(value) >= 1_000_000) return `${sign}$${(value / 1_000_000).toFixed(2)}M/bp`
  if (Math.abs(value) >= 1_000) return `${sign}$${(value / 1_000).toFixed(1)}k/bp`
  return `${sign}$${value.toFixed(0)}/bp`
}

/** Clamp a value to [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Color for a signed value: positive = green, negative = red, zero = muted */
export function signColor(value: number): string {
  if (value > 0) return '#00cc66'
  if (value < 0) return '#ff3333'
  return 'rgba(255,255,255,0.35)'
}
