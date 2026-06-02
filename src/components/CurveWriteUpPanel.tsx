'use client'

import { useEffect, useMemo, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import {
  buildCurveWriteUp,
  MacroWriteUpMode,
  WriteUpPeriod,
} from '@/lib/curveWriteUp'
import { MacroRelease, MarketDay, SpreadsData, YieldCurve } from '@/types'

interface CurveWriteUpPanelProps {
  curve: YieldCurve | null
  spreads: (SpreadsData & { regime?: { level: number; slope: number; curvature: number; label: string } }) | null
  changes: Record<string, { from_date: string; to_date: string; changes: Record<string, number> }> | null
  curveType: 'full' | 'futures'
  loading?: boolean
}

const PERIODS: WriteUpPeriod[] = ['1D', '1W', '1M', '1Y']

const MACRO_MODES: { id: MacroWriteUpMode; label: string }[] = [
  { id: 'off', label: 'Curve only' },
  { id: 'past_week', label: '+ past macro' },
  { id: 'upcoming_week', label: '+ upcoming macro' },
]

export default function CurveWriteUpPanel({
  curve,
  spreads,
  changes,
  curveType,
  loading,
}: CurveWriteUpPanelProps) {
  const [period, setPeriod] = useState<WriteUpPeriod>('1W')
  const [macroMode, setMacroMode] = useState<MacroWriteUpMode>('off')
  const [macroEvents, setMacroEvents] = useState<MacroRelease[]>([])
  const [marketDays, setMarketDays] = useState<MarketDay[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (macroMode === 'off') return
    fetch('/api/macro/calendar?days=14')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          setMacroEvents(d.data.events ?? [])
          setMarketDays(d.data.market_days ?? [])
        }
      })
      .catch(() => {
        setMacroEvents([])
        setMarketDays([])
      })
  }, [macroMode])

  const text = useMemo(() => {
    if (!curve || !spreads || !changes) return ''
    return buildCurveWriteUp({
      curveDate: curve.date,
      curveType,
      yields: curve.yields,
      changes,
      spreads,
      period,
      macroMode,
      macroEvents,
      marketDays,
    })
  }, [curve, spreads, changes, curveType, period, macroMode, macroEvents, marketDays])

  const copy = async () => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const availablePeriods = PERIODS.filter((p) => changes?.[p])

  return (
    <div>
      <p className="font-mono text-[9px] leading-relaxed mb-2 pb-2 border-b border-white/[0.05]" style={{ color: 'rgba(255,255,255,0.3)' }}>
        Auto-generated summary from FRED curve, spreads, and optional macro calendar.
      </p>

      <div className="flex flex-wrap gap-1 mb-2">
        {(availablePeriods.length ? availablePeriods : PERIODS).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className="px-2 py-0.5 font-mono text-[9px] rounded-[2px] border transition-colors"
            style={{
              borderColor: period === p ? 'rgba(255,102,0,0.5)' : 'rgba(255,255,255,0.08)',
              background: period === p ? 'rgba(255,102,0,0.15)' : 'transparent',
              color: period === p ? '#ff6600' : 'rgba(255,255,255,0.4)',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {MACRO_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMacroMode(m.id)}
            className="px-2 py-0.5 font-mono text-[9px] rounded-[2px] border transition-colors"
            style={{
              borderColor: macroMode === m.id ? 'rgba(255,102,0,0.5)' : 'rgba(255,255,255,0.08)',
              background: macroMode === m.id ? 'rgba(255,102,0,0.15)' : 'transparent',
              color: macroMode === m.id ? '#ff6600' : 'rgba(255,255,255,0.4)',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div
        className="rounded-[2px] border p-2 max-h-48 overflow-y-auto font-mono text-[9px] leading-relaxed whitespace-pre-wrap"
        style={{
          borderColor: 'rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.25)',
          color: 'rgba(255,255,255,0.65)',
        }}
      >
        {loading || !text ? 'Loading curve data…' : text}
      </div>

      <button
        type="button"
        onClick={copy}
        disabled={!text}
        className="mt-2 flex items-center gap-1.5 px-2 py-1 btn-terminal disabled:opacity-40"
      >
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
        <span className="text-[10px] font-mono">{copied ? 'COPIED' : 'COPY WRITE-UP'}</span>
      </button>
    </div>
  )
}
