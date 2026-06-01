'use client'

import { useMemo } from 'react'
import { Group } from '@visx/group'
import { LinePath } from '@visx/shape'
import { scaleLinear, scaleTime } from '@visx/scale'
import { AxisLeft, AxisBottom } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { curveMonotoneX } from '@visx/curve'
import { SPREAD_CHART_COLORS, SpreadHistoryPoint } from '@/types'

interface SpreadSeries {
  key: string
  label: string
  color: string
  data: SpreadHistoryPoint[]
}

interface SpreadTimeSeriesChartProps {
  series: SpreadSeries[]
  width: number
  height?: number
}

const margin = { top: 16, right: 16, bottom: 36, left: 48 }

export default function SpreadTimeSeriesChart({
  series,
  width,
  height = 280,
}: SpreadTimeSeriesChartProps) {
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom

  const parsed = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        points: s.data.map((d) => ({
          date: new Date(d.date + 'T12:00:00'),
          value: d.value,
        })),
      })),
    [series],
  )

  const allDates = parsed.flatMap((s) => s.points.map((p) => p.date))
  const allValues = parsed.flatMap((s) => s.points.map((p) => p.value))

  const xScale = useMemo(
    () =>
      scaleTime<number>({
        domain: [
          Math.min(...allDates.map((d) => d.getTime())),
          Math.max(...allDates.map((d) => d.getTime())),
        ],
        range: [0, innerW],
      }),
    [allDates, innerW],
  )

  const yScale = useMemo(() => {
    const min = Math.min(...allValues, 0) - 10
    const max = Math.max(...allValues, 0) + 10
    return scaleLinear<number>({ domain: [min, max], range: [innerH, 0], nice: true })
  }, [allValues, innerH])

  if (series.length === 0 || allDates.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Select spreads to plot history
        </span>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-3 mb-2 px-1">
        {parsed.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 font-mono text-[9px]">
            <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>{s.label}</span>
          </div>
        ))}
      </div>
      <svg width={width} height={height}>
        <rect x={0} y={0} width={width} height={height} fill="#07090c" rx={2} />
        <Group left={margin.left} top={margin.top}>
          <GridRows scale={yScale} width={innerW} stroke="rgba(255,255,255,0.05)" strokeDasharray="3,4" />
          {parsed.map((s) => (
            <LinePath
              key={s.key}
              data={s.points}
              x={(d) => xScale(d.date) ?? 0}
              y={(d) => yScale(d.value) ?? 0}
              stroke={s.color}
              strokeWidth={2}
              curve={curveMonotoneX}
            />
          ))}
          <AxisLeft
            scale={yScale}
            stroke="rgba(255,255,255,0.08)"
            tickStroke="rgba(255,255,255,0.08)"
            tickFormat={(v) => `${v}`}
            tickLabelProps={() => ({
              fill: 'rgba(255,255,255,0.4)',
              fontSize: 9,
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
            tickStroke="rgba(255,255,255,0.08)"
            tickFormat={(d) => {
              const date = d as Date
              return `${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`
            }}
            tickLabelProps={() => ({
              fill: 'rgba(255,255,255,0.35)',
              fontSize: 8,
              fontFamily: 'JetBrains Mono, monospace',
              textAnchor: 'middle',
              dy: 4,
            })}
            numTicks={6}
          />
        </Group>
      </svg>
      <p className="font-mono text-[8px] mt-1 text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>
        Spread history (bp) · click spreads in sidebar to add/remove (max 3)
      </p>
    </div>
  )
}

export function spreadColor(key: string): string {
  return SPREAD_CHART_COLORS[key] ?? '#888888'
}
