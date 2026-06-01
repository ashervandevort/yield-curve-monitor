'use client'

import { SpreadsData } from '@/types'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface SpreadsPanelProps {
  data: SpreadsData | null
  loading?: boolean
  selectedSpreads?: string[]
  onSpreadToggle?: (spreadKey: string) => void
  maxSelected?: number
}

const SPREAD_CONFIG: Record<
  string,
  {
    label: string
    formula: string
    note: string
    importance: 'primary' | 'secondary' | 'tertiary'
  }
> = {
  '2s10s':    { label: '2s10s',    formula: '10Y − 2Y',           note: 'Recession / cycle signal',     importance: 'primary' },
  '3m10y':    { label: '3m10y',    formula: '10Y − 3M',           note: 'Fed policy vs long end',       importance: 'primary' },
  '5s30s':    { label: '5s30s',    formula: '30Y − 5Y',           note: 'Long-end term premium',        importance: 'secondary' },
  '2s30s':    { label: '2s30s',    formula: '30Y − 2Y',           note: 'Full curve slope',             importance: 'secondary' },
  '2s5s':     { label: '2s5s',     formula: '5Y − 2Y',            note: 'Front-end steepness',          importance: 'tertiary' },
  '5s10s30s': { label: '5s10s30s', formula: '(5Y+30Y)/2 − 10Y',   note: 'Belly butterfly',            importance: 'tertiary' },
  '2s5s10s':  { label: '2s5s10s',  formula: '(2Y+10Y)/2 − 5Y',    note: 'Front butterfly',              importance: 'tertiary' },
}

const ORDER = ['2s10s', '3m10y', '5s30s', '2s30s', '2s5s', '5s10s30s', '2s5s10s']

function regimeLabel(interpretation: string): { text: string; color: string; Icon: typeof TrendingUp } {
  if (interpretation === 'inverted') return { text: 'Inv', color: '#ff3333', Icon: TrendingDown }
  if (interpretation === 'steepening') return { text: 'Steep', color: '#00cc66', Icon: TrendingUp }
  return { text: 'Norm', color: 'rgba(255,255,255,0.35)', Icon: Minus }
}

function SpreadRow({
  spread,
  config,
  spreadKey,
  selected,
  onToggle,
}: {
  spread: { value: number; interpretation: string } | undefined
  config: (typeof SPREAD_CONFIG)[string]
  spreadKey: string
  selected?: boolean
  onToggle?: (key: string) => void
}) {
  if (!spread) return null
  const { text, color, Icon } = regimeLabel(spread.interpretation)
  const isPrimary = config.importance === 'primary'
  const clickable = Boolean(onToggle)

  return (
    <button
      type="button"
      onClick={() => onToggle?.(spreadKey)}
      disabled={!clickable}
      className={`w-full text-left flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0 transition-colors ${
        isPrimary ? 'border-l-2 border-l-bloomberg-orange/60 pl-2' : 'pl-0.5'
      } ${selected ? 'bg-bloomberg-orange/10' : clickable ? 'hover:bg-white/[0.03]' : ''} ${
        clickable ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="min-w-0 flex-1 pr-2">
        <div className="flex items-center gap-1.5">
          <span className="tenor-label text-[10px]">{config.label}</span>
          <span className="font-mono text-[8px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {config.formula}
          </span>
        </div>
        <div className="font-mono text-[8px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.2)' }}>
          {config.note}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div
          className="font-mono font-bold text-sm leading-none"
          style={{ color: spread.value > 0 ? '#00cc66' : spread.value < 0 ? '#ff3333' : 'rgba(255,255,255,0.4)' }}
        >
          {spread.value > 0 ? '+' : ''}{spread.value.toFixed(1)}
          <span className="text-[9px] font-normal ml-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>bp</span>
        </div>
        <div className="flex items-center justify-end gap-0.5 mt-0.5">
          <Icon className="w-2.5 h-2.5" style={{ color }} />
          <span className="font-mono text-[8px] uppercase" style={{ color }}>{text}</span>
        </div>
      </div>
    </button>
  )
}

export default function SpreadsPanel({
  data,
  loading,
  selectedSpreads = [],
  onSpreadToggle,
  maxSelected = 3,
}: SpreadsPanelProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-8 rounded" />
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="py-4 text-center">
        <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          No spread data available
        </span>
      </div>
    )
  }

  const hasInversion = Object.values(data.spreads).some((s) => s?.interpretation === 'inverted')

  return (
    <div>
      {/* Context — no duplicate panel title; parent header owns "Key Spreads" */}
      <p className="font-mono text-[9px] leading-relaxed mb-2 pb-2 border-b border-white/[0.05]" style={{ color: 'rgba(255,255,255,0.3)' }}>
        Spot closing spreads · latest FRED curve
        {data.date && (
          <span style={{ color: 'rgba(255,255,255,0.45)' }}> · as of {data.date}</span>
        )}
        <br />
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>
          Level today, not a change over time. Click up to {maxSelected} spreads to plot history.
        </span>
      </p>

      <div>
        {ORDER.map((key) => (
          <SpreadRow
            key={key}
            spreadKey={key}
            spread={data.spreads[key as keyof typeof data.spreads]}
            config={SPREAD_CONFIG[key]}
            selected={selectedSpreads.includes(key)}
            onToggle={onSpreadToggle}
          />
        ))}
      </div>

      {hasInversion && (
        <div className="mt-2 p-2 rounded-[2px] border border-red-500/25 bg-red-500/[0.04]">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="font-mono text-[9px] text-red-400 uppercase tracking-wide">
              Inversion detected
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
