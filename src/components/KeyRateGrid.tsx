'use client'

import { KEY_RATE_TENORS } from '@/types'

interface KeyRateGridProps {
  /** Raw DV01 values by tenor ($/bp) */
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  /** Optional highlight for a specific tenor (from proximity) */
  activeTenor?: string | null
  readOnly?: boolean
  compact?: boolean
}

const TENOR_COLOR: Record<string, string> = {
  '2Y':  '#ff9900',
  '3Y':  '#ffbb00',
  '5Y':  '#ffdd00',
  '7Y':  '#ccdd00',
  '10Y': '#00cccc',
  '20Y': '#0099cc',
  '30Y': '#0077bb',
}

export default function KeyRateGrid({
  values,
  onChange,
  activeTenor,
  readOnly = false,
  compact = false,
}: KeyRateGridProps) {
  const handleChange = (tenor: string, raw: string) => {
    if (readOnly) return
    // Allow empty, sign prefix, and numbers (integers or decimals)
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
                className="text-center font-mono text-xs py-1 rounded-sm border"
                style={{
                  background: hasValue
                    ? isPositive
                      ? 'rgba(0,204,102,0.08)'
                      : 'rgba(255,51,51,0.08)'
                    : 'rgba(0,0,0,0.3)',
                  borderColor: isActive
                    ? 'rgba(255,255,255,0.3)'
                    : hasValue
                      ? isPositive
                        ? 'rgba(0,204,102,0.25)'
                        : 'rgba(255,51,51,0.25)'
                      : 'rgba(255,255,255,0.07)',
                  color: hasValue
                    ? isPositive ? '#00cc66' : '#ff3333'
                    : 'rgba(255,255,255,0.25)',
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
                  borderColor: isActive
                    ? 'rgba(255,102,0,0.5)'
                    : hasValue
                      ? isPositive
                        ? 'rgba(0,204,102,0.3)'
                        : 'rgba(255,51,51,0.3)'
                      : undefined,
                  color: hasValue
                    ? isPositive ? '#00cc66' : '#ff3333'
                    : undefined,
                }}
              />
            )}

            {/* Visual bar indicator */}
            {hasValue && (
              <div className="h-0.5 rounded-full mx-0.5">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (Math.abs(num) / 10000) * 100)}%`,
                    background: isPositive ? '#00cc66' : '#ff3333',
                    marginLeft: isNegative ? 'auto' : undefined,
                    opacity: 0.6,
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
