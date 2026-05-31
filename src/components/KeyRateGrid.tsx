'use client'

import { KEY_RATE_TENORS } from '@/types'

interface KeyRateGridProps {
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  activeTenor?: string | null
  readOnly?: boolean
  compact?: boolean
}

// Approximate par-bond modified durations at each key-rate tenor
// Used to back out implied notional from entered DV01: notional = DV01 / (modDur × 0.0001)
const APPROX_MOD_DUR: Record<string, number> = {
  '2Y': 1.9, '3Y': 2.8, '5Y': 4.5, '7Y': 6.2,
  '10Y': 8.5, '20Y': 13.5, '30Y': 18.0,
}

function impliedNotional(dv01: number, tenor: string): string {
  const md = APPROX_MOD_DUR[tenor]
  if (!md || dv01 === 0) return ''
  const n = Math.abs(dv01) / (md * 0.0001)
  if (n >= 1_000_000_000) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1_000_000)     return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1_000)         return `$${(n / 1e3).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

const TENOR_COLOR: Record<string, string> = {
  '2Y':  '#ff9900', '3Y': '#ffbb00', '5Y': '#ffdd00', '7Y': '#ccdd00',
  '10Y': '#00cccc', '20Y': '#0099cc', '30Y': '#0077bb',
}

export default function KeyRateGrid({
  values, onChange, activeTenor, readOnly = false, compact = false,
}: KeyRateGridProps) {
  const handleChange = (tenor: string, raw: string) => {
    if (readOnly) return
    if (raw === '' || raw === '-' || /^-?\d*\.?\d*$/.test(raw)) {
      onChange({ ...values, [tenor]: raw })
    }
  }

  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-7' : 'grid-cols-7'}`}>
      {KEY_RATE_TENORS.map((tenor) => {
        const isActive = activeTenor === tenor
        const raw = values[tenor] ?? ''
        const num = parseFloat(raw)
        const hasValue = raw !== '' && !isNaN(num) && num !== 0
        const isPositive = num > 0
        const isNegative = num < 0
        const implied = hasValue ? impliedNotional(num, tenor) : ''

        return (
          <div
            key={tenor}
            className={`flex flex-col gap-0.5 transition-all ${isActive ? 'opacity-100' : 'opacity-90'}`}
          >
            {/* Tenor label */}
            <div
              className="text-center font-mono font-semibold"
              style={{
                fontSize: compact ? '9px' : '10px',
                color: isActive ? TENOR_COLOR[tenor] ?? '#ffcc00' : 'rgba(255,204,0,0.7)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              {tenor}
            </div>

            {/* Input or display */}
            {readOnly ? (
              <div
                className="text-center font-mono py-1 rounded-sm border"
                style={{
                  background: hasValue ? isPositive ? 'rgba(0,204,102,0.08)' : 'rgba(255,51,51,0.08)' : 'rgba(0,0,0,0.3)',
                  borderColor: isActive ? 'rgba(255,255,255,0.3)' : hasValue ? isPositive ? 'rgba(0,204,102,0.25)' : 'rgba(255,51,51,0.25)' : 'rgba(255,255,255,0.07)',
                  color: hasValue ? isPositive ? '#00cc66' : '#ff3333' : 'rgba(255,255,255,0.25)',
                  fontSize: compact ? '9px' : '11px',
                  padding: compact ? '2px 0' : '3px 0',
                }}
              >
                {hasValue ? (num > 0 ? '+' : '') + num.toLocaleString() : '—'}
              </div>
            ) : (
              <input
                type="text"
                value={raw}
                onChange={(e) => handleChange(tenor, e.target.value)}
                placeholder="0"
                className="input-terminal text-right w-full"
                style={{
                  fontSize: compact ? '10px' : '12px',
                  padding: compact ? '2px 4px' : '3px 6px',
                  borderColor: isActive ? 'rgba(255,102,0,0.5)' : hasValue ? isPositive ? 'rgba(0,204,102,0.3)' : 'rgba(255,51,51,0.3)' : undefined,
                  color: hasValue ? isPositive ? '#00cc66' : '#ff3333' : undefined,
                }}
              />
            )}

            {/* Visual bar indicator */}
            {hasValue && (
              <div className="h-0.5 rounded-full mx-0.5 overflow-hidden bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (Math.abs(num) / 10000) * 100)}%`,
                    background: isPositive ? '#00cc66' : '#ff3333',
                    marginLeft: isNegative ? 'auto' : undefined,
                    opacity: 0.7,
                  }}
                />
              </div>
            )}

            {/* Implied notional */}
            {implied && (
              <div
                className="text-center font-mono"
                style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', letterSpacing: '-0.02em' }}
                title={`≈${implied} notional at ~${APPROX_MOD_DUR[tenor]}yr mod-dur`}
              >
                {implied}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
