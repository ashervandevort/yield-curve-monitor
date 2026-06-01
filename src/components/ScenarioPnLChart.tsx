'use client'

import { useMemo, useState } from 'react'
import { Group } from '@visx/group'
import { scaleLinear, scalePoint } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { LinePath } from '@visx/shape'
import { curveMonotoneX } from '@visx/curve'
import { ScenarioRow } from '@/types'

interface ScenarioPnLChartProps {
  scenarios: ScenarioRow[]
  width: number
  height?: number
}

const SERIES = [
  { key: 'pre_hedge' as const, label: 'Target book', color: '#00cccc' },
  { key: 'hedge_pnl' as const, label: 'Futures book', color: '#9966ff' },
  { key: 'combined_pnl' as const, label: 'Combined (both legs)', color: '#ff6600' },
  { key: 'net_pnl' as const, label: 'Net exposure (residual)', color: '#ffcc00' },
]

function pnlColor(v: number): string {
  if (v > 0) return '#00cc66'
  if (v < 0) return '#ff3333'
  return 'rgba(255,255,255,0.35)'
}

export default function ScenarioPnLChart({ scenarios, width, height = 220 }: ScenarioPnLChartProps) {
  const [visible, setVisible] = useState<Set<string>>(
    new Set(['pre_hedge', 'hedge_pnl', 'net_pnl']),
  )

  const labels = useMemo(() => scenarios.map((s) => s.label), [scenarios])
  const margin = { top: 12, right: 12, bottom: 52, left: 52 }
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom

  const allValues = scenarios.flatMap((s) =>
    SERIES.filter((x) => visible.has(x.key)).map((x) => {
      const v = s[x.key]
      return typeof v === 'number' ? v : 0
    }),
  )
  const yMin = allValues.length ? Math.min(...allValues, 0) : -1
  const yMax = allValues.length ? Math.max(...allValues, 0) : 1
  const pad = Math.max(Math.abs(yMin), Math.abs(yMax)) * 0.12 || 1000

  const xScale = scalePoint<string>({ domain: labels, range: [0, innerW], padding: 0.4 })
  const yScale = scaleLinear<number>({
    domain: [yMin - pad, yMax + pad],
    range: [innerH, 0],
    nice: true,
  })

  const toggle = (key: string) => {
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Normal curve backdrop (illustrative — scenarios are discrete shocks, not a continuous dist)
  const bellPoints = useMemo(() => {
    const pts: { x: number; y: number }[] = []
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      const x = t * innerW
      const z = (t - 0.5) * 6
      const y = Math.exp(-0.5 * z * z)
      pts.push({ x, y: innerH * 0.35 * y + innerH * 0.55 })
    }
    return pts
  }, [innerW, innerH])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 px-1">
        {SERIES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => toggle(s.key)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-[8px] transition-colors ${
              visible.has(s.key)
                ? 'border-white/20 bg-white/[0.06]'
                : 'border-white/[0.06] opacity-40'
            }`}
          >
            <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>

      <svg width={width} height={height}>
        <rect width={width} height={height} fill="#07090c" rx={2} />
        <Group left={margin.left} top={margin.top}>
          <LinePath
            data={bellPoints}
            x={(d) => d.x}
            y={(d) => d.y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
            fill="rgba(255,255,255,0.02)"
            curve={curveMonotoneX}
          />
          <line
            x1={0}
            x2={innerW}
            y1={yScale(0)}
            y2={yScale(0)}
            stroke="rgba(255,255,255,0.12)"
            strokeDasharray="4,4"
          />
          {SERIES.filter((s) => visible.has(s.key)).map((series) => {
            const pts = scenarios.map((row) => ({
              label: row.label,
              value: (row[series.key] as number | undefined) ?? 0,
            }))
            return (
              <g key={series.key}>
                <LinePath
                  data={pts}
                  x={(d) => xScale(d.label) ?? 0}
                  y={(d) => yScale(d.value)}
                  stroke={series.color}
                  strokeWidth={1.5}
                  strokeOpacity={0.85}
                  curve={curveMonotoneX}
                />
                {pts.map((p) => (
                  <circle
                    key={`${series.key}-${p.label}`}
                    cx={xScale(p.label) ?? 0}
                    cy={yScale(p.value)}
                    r={3}
                    fill={series.color}
                    stroke="#07090c"
                    strokeWidth={1}
                  />
                ))}
              </g>
            )
          })}
          <AxisLeft
            scale={yScale}
            stroke="rgba(255,255,255,0.08)"
            tickFormat={(v) => {
              const n = Number(v)
              if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
              if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
              return `$${n}`
            }}
            tickLabelProps={() => ({
              fill: 'rgba(255,255,255,0.35)',
              fontSize: 8,
              fontFamily: 'JetBrains Mono, monospace',
              textAnchor: 'end',
              dx: -4,
            })}
            numTicks={5}
          />
          <AxisBottom
            scale={xScale}
            top={innerH}
            stroke="rgba(255,255,255,0.08)"
            tickFormat={(d) => {
              const s = String(d)
              return s.length > 14 ? s.slice(0, 12) + '…' : s
            }}
            tickLabelProps={() => ({
              fill: 'rgba(255,255,255,0.3)',
              fontSize: 7,
              fontFamily: 'JetBrains Mono, monospace',
              textAnchor: 'end',
              angle: -35,
              dx: -2,
              dy: 4,
            })}
          />
        </Group>
      </svg>
      <p className="font-mono text-[8px] text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>
        Shaded curve is illustrative · P&amp;L = −DV01 × shock (bp) · toggle series above
      </p>
    </div>
  )
}

export { pnlColor }
