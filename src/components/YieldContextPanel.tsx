'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { YieldCurve } from '@/types'
import {
  HistoryWindow,
  downsample,
  formatPercentile,
  historyWindowDays,
  percentileColor,
  percentileRank,
  subtractDays,
  zScore,
} from '@/lib/historicalStats'

interface HistoryPoint {
  date: string
  [tenor: string]: string | number | null
}

interface YieldContextPanelProps {
  curve: YieldCurve | null
  loading?: boolean
}

const WINDOWS: HistoryWindow[] = ['1Y', '5Y', '10Y']
const WINDOW_LABEL: Record<HistoryWindow, string> = {
  '1Y': '1-year',
  '5Y': '5-year',
  '10Y': '10-year',
}
const FOCUS_TENORS = ['2Y', '10Y', '30Y'] as const

/** Yield level time series — line + end dot colored by current percentile rank */
function YieldSparkline({
  values,
  percentile,
  width = 120,
  height = 32,
}: {
  values: number[]
  percentile: number
  width?: number
  height?: number
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 0.01
  const stroke = percentileColor(percentile)

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 6) - 3
    return { x, y }
  })
  const poly = pts.map((p) => `${p.x},${p.y}`).join(' ')
  const last = pts[pts.length - 1]

  return (
    <svg width={width} height={height} className="block w-full" viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" stroke={stroke} strokeWidth={1.4} points={poly} />
      <circle cx={last.x} cy={last.y} r={3.5} fill={stroke} stroke="#07090c" strokeWidth={1} />
    </svg>
  )
}

function PercentileStrip({ percentile }: { percentile: number }) {
  const clamped = Math.min(100, Math.max(0, percentile))
  return (
    <div className="mt-1.5">
      <div className="flex justify-between font-mono text-[7px] mb-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
        <span>0th</span>
        <span>50th</span>
        <span>100th</span>
      </div>
      <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'linear-gradient(90deg, #0a4d3a 0%, #ff6600 50%, #ff3333 100%)',
            opacity: 0.85,
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-1 h-3 rounded-sm"
          style={{
            left: `calc(${clamped}% - 2px)`,
            background: '#fff',
            boxShadow: '0 0 4px rgba(0,0,0,0.5)',
          }}
        />
      </div>
    </div>
  )
}

export default function YieldContextPanel({ curve, loading }: YieldContextPanelProps) {
  const [window, setWindow] = useState<HistoryWindow>('5Y')
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  useEffect(() => {
    if (!curve?.date) return
    const start = subtractDays(curve.date, historyWindowDays(window))
    const tenors = FOCUS_TENORS.join(',')
    setHistoryLoading(true)
    setHistoryError(null)
    fetch(`/api/curve/history?start_date=${start}&end_date=${curve.date}&tenors=${tenors}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) setHistory(d.data)
        else setHistoryError(d.error ?? 'No history')
      })
      .catch(() => setHistoryError('Failed to load history'))
      .finally(() => setHistoryLoading(false))
  }, [curve?.date, window])

  const tenorStats = useMemo(() => {
    if (!curve) return []
    return FOCUS_TENORS.map((tenor) => {
      const current = curve.yields[tenor]
      const series = history
        .map((p) => p[tenor])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      if (current === undefined || !series.length) {
        return { tenor, current, percentile: NaN, z: NaN, spark: [] as number[] }
      }
      return {
        tenor,
        current,
        percentile: percentileRank(series, current),
        z: zScore(series, current),
        spark: downsample(series),
      }
    })
  }, [curve, history])

  if (loading && !curve) {
    return (
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Historical Context</span>
        </div>
        <div className="panel-body-sm space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-14 rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (!curve) return null

  return (
    <div className="panel">
      <div className="panel-header flex-col sm:flex-row gap-2">
        <span className="panel-title">Historical Context</span>
        <div className="flex items-center gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              className="px-2 py-0.5 font-mono text-[9px] font-semibold rounded-[1px] uppercase tracking-wider transition-all"
              style={{
                background: window === w ? 'rgba(255,102,0,0.2)' : 'transparent',
                color: window === w ? '#ff6600' : 'rgba(255,255,255,0.35)',
                border: `1px solid ${window === w ? 'rgba(255,102,0,0.45)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body-sm">
        {historyLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-14 rounded" />
            ))}
          </div>
        ) : historyError ? (
          <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {historyError}
          </span>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {tenorStats.map((s, i) => (
              <motion.div
                key={s.tenor}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-[2px] p-2.5"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="tenor-label text-[10px]">{s.tenor}</span>
                  <span className="font-mono text-sm font-semibold" style={{ color: '#00cccc' }}>
                    {s.current?.toFixed(2)}%
                  </span>
                </div>
                <YieldSparkline values={s.spark} percentile={s.percentile} />
                <div className="flex items-baseline justify-between mt-1.5">
                  <span
                    className="font-mono text-[10px] font-semibold"
                    style={{ color: percentileColor(s.percentile) }}
                  >
                    {formatPercentile(s.percentile)} pct
                  </span>
                  {Number.isFinite(s.z) && (
                    <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      z {s.z >= 0 ? '+' : ''}{s.z.toFixed(1)}σ
                    </span>
                  )}
                </div>
                <PercentileStrip percentile={s.percentile} />
              </motion.div>
            ))}
          </div>
        )}
        {!historyLoading && !historyError && (
          <p className="font-mono text-[9px] mt-3 text-center sm:text-left" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Sparklines plot yield levels over the selected {WINDOW_LABEL[window]} lookback. Dot color and the bar
            below show where today&apos;s rate ranks (0th–100th percentile) within that history.
          </p>
        )}
      </div>
    </div>
  )
}
