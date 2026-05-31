'use client'

import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
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
  height?: number
  activeTenor?: string | null
  onTenorHover?: (tenor: string | null) => void
}

const margin = { top: 20, right: 12, bottom: 32, left: 58 }

const COLORS = {
  target:   '#00cccc',
  achieved: '#ff9900',
  residual: '#ff4444',
}

export default function KrdProfileChart({
  target,
  achieved,
  residual,
  unit = 'krd',
  notional = 0,
  height = 200,
  activeTenor,
  onTenorHover,
}: KrdProfileChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(560)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width || 560)
    })
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width || 560)
    return () => ro.disconnect()
  }, [])

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
        convert(target[t] ?? 0, t as KeyRateTenor),
        convert(achieved[t] ?? 0, t as KeyRateTenor),
        convert(residual[t] ?? 0, t as KeyRateTenor),
      ]),
    [tenors, target, achieved, residual, convert],
  )

  const domainMax = Math.max(
    Math.abs(Math.max(...allValues, 0)),
    Math.abs(Math.min(...allValues, 0)),
    1,
  )
  const padded = domainMax * 1.2

  const xScale = scaleBand<string>({
    domain: tenors,
    range: [0, innerW],
    padding: 0.22,
  })

  const yScale = scaleLinear<number>({
    domain: [-padded, padded],
    range: [innerH, 0],
    nice: true,
  })

  const groupWidth = xScale.bandwidth()
  const barW = Math.max(3, (groupWidth / 3) - 2)
  const zero = yScale(0)

  return (
    <div ref={containerRef} className="relative w-full">
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

      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <rect width={width} height={height} fill="transparent" rx={2} />

        <Group left={margin.left} top={margin.top}>
          {/* Zero line */}
          <line
            x1={0} x2={innerW}
            y1={zero} y2={zero}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={1}
          />

          {/* Horizontal grid */}
          {yScale.ticks(5).filter(t => t !== 0).map((tick) => (
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
                {isActive && (
                  <rect
                    x={x0 - 3}
                    y={0}
                    width={groupWidth + 6}
                    height={innerH}
                    fill="rgba(255,255,255,0.035)"
                    rx={2}
                  />
                )}

                {series.map(({ key, raw, color }, i) => {
                  const cv = convert(raw, tenor as KeyRateTenor)
                  const barY = cv >= 0 ? yScale(cv) : zero
                  const barH = Math.max(1, Math.abs(yScale(cv) - zero))
                  return (
                    <rect
                      key={key}
                      x={x0 + i * (barW + 2)}
                      y={barY}
                      width={barW}
                      height={barH}
                      fill={color}
                      opacity={isActive ? 1 : 0.78}
                      rx={1}
                    />
                  )
                })}

                {isActive && (
                  <g>
                    {series.map(({ key, raw, color }, i) => {
                      const cv = convert(raw, tenor as KeyRateTenor)
                      if (Math.abs(cv) < 0.001) return null
                      const barH = Math.abs(yScale(cv) - zero)
                      return (
                        <text
                          key={key}
                          x={x0 + i * (barW + 2) + barW / 2}
                          y={cv >= 0 ? yScale(cv) - 4 : yScale(cv) + barH + 11}
                          textAnchor="middle"
                          fontSize={7}
                          fontFamily="JetBrains Mono, monospace"
                          fill={color}
                          opacity={0.95}
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
              fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
              textAnchor: 'middle',
              dy: 5,
            })}
          />
        </Group>
      </svg>
    </div>
  )
}
