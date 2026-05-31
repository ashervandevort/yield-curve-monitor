'use client'

import { useMemo, useCallback } from 'react'
import { Group } from '@visx/group'
import { scaleBand, scaleLinear } from '@visx/scale'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { KEY_RATE_TENORS, KeyRateTenor, DisplayUnit } from '@/types'
import { convertUnit, formatUnit } from '@/lib/analytics'

interface KrdProfileChartProps {
  target: Record<string, number>
  achieved: Record<string, number>
  residual: Record<string, number>
  unit?: DisplayUnit
  notional?: number
  width?: number
  height?: number
  activeTenor?: string | null
  onTenorHover?: (tenor: string | null) => void
}

const margin = { top: 16, right: 16, bottom: 32, left: 60 }

const COLORS = {
  target:   '#00cccc',
  achieved: '#ff9900',
  residual: '#ff3333',
}

export default function KrdProfileChart({
  target,
  achieved,
  residual,
  unit = 'krd',
  notional = 0,
  width = 560,
  height = 220,
  activeTenor,
  onTenorHover,
}: KrdProfileChartProps) {
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom

  const convert = useCallback(
    (v: number, t: KeyRateTenor) => convertUnit(v, unit, notional, t),
    [unit, notional],
  )

  const tenors = KEY_RATE_TENORS
  const allValues = useMemo(
    () =>
      tenors.flatMap((t) => [
        convert(target[t] ?? 0, t),
        convert(achieved[t] ?? 0, t),
        convert(residual[t] ?? 0, t),
      ]),
    [tenors, target, achieved, residual, convert],
  )

  const domainMax = Math.max(Math.abs(Math.max(...allValues, 0)), Math.abs(Math.min(...allValues, 0)), 1)
  const padded = domainMax * 1.2

  const xScale = scaleBand<string>({
    domain: tenors,
    range: [0, innerW],
    padding: 0.25,
  })

  const yScale = scaleLinear<number>({
    domain: [-padded, padded],
    range: [innerH, 0],
    nice: true,
  })

  const groupWidth = xScale.bandwidth()
  const barW = Math.max(2, (groupWidth / 3) - 1)

  const zero = yScale(0)

  return (
    <div className="relative">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-2 px-1">
        {Object.entries(COLORS).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
            <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {key}
            </span>
          </div>
        ))}
      </div>

      <svg width={width} height={height}>
        <rect width={width} height={height} fill="#07090c" rx={2} />

        <Group left={margin.left} top={margin.top}>
          {/* Zero line */}
          <line
            x1={0} x2={innerW}
            y1={zero} y2={zero}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={1}
          />

          {/* Horizontal grid */}
          {yScale.ticks(4).map((tick) => (
            <line
              key={tick}
              x1={0} x2={innerW}
              y1={yScale(tick)} y2={yScale(tick)}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
            />
          ))}

          {/* Bars */}
          {tenors.map((tenor) => {
            const x0 = xScale(tenor) ?? 0
            const isActive = activeTenor === tenor

            const series = [
              { key: 'target',   raw: target[tenor] ?? 0,   color: COLORS.target },
              { key: 'achieved', raw: achieved[tenor] ?? 0, color: COLORS.achieved },
              { key: 'residual', raw: residual[tenor] ?? 0, color: COLORS.residual },
            ]

            return (
              <g
                key={tenor}
                onMouseEnter={() => onTenorHover?.(tenor)}
                onMouseLeave={() => onTenorHover?.(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Hover highlight */}
                {isActive && (
                  <rect
                    x={x0 - 2}
                    y={0}
                    width={groupWidth + 4}
                    height={innerH}
                    fill="rgba(255,255,255,0.03)"
                    rx={1}
                  />
                )}

                {series.map(({ key, raw, color }, i) => {
                  const cv = convert(raw, tenor as KeyRateTenor)
                  const barY = cv >= 0 ? yScale(cv) : zero
                  const barH = Math.abs(yScale(cv) - zero)
                  return (
                    <rect
                      key={key}
                      x={x0 + i * (barW + 1)}
                      y={barY}
                      width={barW}
                      height={Math.max(1, barH)}
                      fill={color}
                      opacity={isActive ? 1 : 0.75}
                      rx={1}
                    />
                  )
                })}

                {/* Active tenor tooltip */}
                {isActive && (
                  <g>
                    {series.map(({ key, raw, color }, i) => {
                      const cv = convert(raw, tenor as KeyRateTenor)
                      if (cv === 0) return null
                      return (
                        <text
                          key={key}
                          x={x0 + i * (barW + 1) + barW / 2}
                          y={cv >= 0 ? yScale(cv) - 3 : yScale(cv) + Math.abs(yScale(cv) - zero) + 11}
                          textAnchor="middle"
                          fontSize={7}
                          fontFamily="JetBrains Mono, monospace"
                          fill={color}
                          opacity={0.9}
                        >
                          {formatUnit(cv, unit)}
                        </text>
                      )
                    })}
                  </g>
                )}
              </g>
            )
          })}

          {/* Axes */}
          <AxisLeft
            scale={yScale}
            stroke="rgba(255,255,255,0.08)"
            tickStroke="rgba(255,255,255,0.08)"
            tickLabelProps={() => ({
              fill: 'rgba(255,255,255,0.3)',
              fontSize: 9,
              fontFamily: 'JetBrains Mono, monospace',
              textAnchor: 'end',
              dx: -4,
              dy: 3,
            })}
            tickFormat={(v) => formatUnit(Number(v), unit)}
            numTicks={5}
          />

          <AxisBottom
            scale={xScale}
            top={innerH}
            stroke="rgba(255,255,255,0.08)"
            tickStroke="rgba(255,255,255,0.08)"
            tickLabelProps={() => ({
              fill: '#ffcc00',
              fontSize: 9,
              fontFamily: 'JetBrains Mono, monospace',
              textAnchor: 'middle',
              dy: 4,
            })}
          />
        </Group>
      </svg>
    </div>
  )
}
