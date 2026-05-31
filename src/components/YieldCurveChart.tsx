'use client'

import { useMemo, useCallback } from 'react'
import { Group } from '@visx/group'
import { LinePath } from '@visx/shape'
import { scaleLinear, scalePoint } from '@visx/scale'
import { AxisLeft, AxisBottom } from '@visx/axis'
import { GridRows } from '@visx/grid'
import { curveMonotoneX } from '@visx/curve'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CurveChartData,
  OverlayCurve,
  TENOR_ORDER,
  FUTURES_TENOR_ORDER,
  formatYield,
  CURVE_COLORS,
} from '@/types'
import { useProximity, ProximityPoint } from '@/lib/useProximity'

interface YieldCurveChartProps {
  todayCurve: CurveChartData[]
  overlays?: OverlayCurve[]
  width?: number
  height?: number
  curveType?: 'full' | 'futures'
  showGrid?: boolean
  showPoints?: boolean
  animate?: boolean
  /** External active tenor (lifted state from page) */
  activeTenor?: string | null
  onTenorChange?: (tenor: string | null) => void
}

const margin = { top: 20, right: 24, bottom: 36, left: 52 }

export default function YieldCurveChart({
  todayCurve,
  overlays = [],
  width = 800,
  height = 320,
  curveType = 'full',
  showGrid = true,
  showPoints = true,
  animate = true,
  activeTenor: externalActiveTenor,
  onTenorChange,
}: YieldCurveChartProps) {
  const tenorOrder = curveType === 'futures' ? FUTURES_TENOR_ORDER : TENOR_ORDER
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom

  const xScale = useMemo(
    () =>
      scalePoint<string>({
        domain: tenorOrder,
        range: [0, innerW],
        padding: 0.5,
      }),
    [innerW, tenorOrder],
  )

  const yScale = useMemo(() => {
    const all = [
      ...todayCurve.map((d) => d.yield),
      ...overlays.flatMap((o) => o.data.map((d) => d.yield)),
    ].filter(Boolean)
    const min = Math.min(...all) - 0.2
    const max = Math.max(...all) + 0.2
    return scaleLinear<number>({ domain: [min, max], range: [innerH, 0], nice: true })
  }, [todayCurve, overlays, innerH])

  // Proximity points aligned with the tenor positions in this chart
  const proximityPoints = useMemo<ProximityPoint[]>(
    () =>
      tenorOrder
        .filter((t) => todayCurve.find((d) => d.tenor === t))
        .map((t) => ({ tenor: t, x: xScale(t) ?? 0 })),
    [tenorOrder, todayCurve, xScale],
  )

  const {
    activeTenor: localActiveTenor,
    crosshairX,
    rawY,
    handleMouseMove,
    handleMouseLeave,
  } = useProximity(proximityPoints, margin.left)

  // The effective active tenor: external (lifted) wins if set, otherwise local
  const activeTenor = externalActiveTenor ?? localActiveTenor

  const handleMove = useCallback(
    (e: React.MouseEvent<SVGElement>) => {
      handleMouseMove(e)
      if (onTenorChange && localActiveTenor) onTenorChange(localActiveTenor)
    },
    [handleMouseMove, onTenorChange, localActiveTenor],
  )

  const handleLeave = useCallback(() => {
    handleMouseLeave()
    onTenorChange?.(null)
  }, [handleMouseLeave, onTenorChange])

  // All curve yields at the active tenor
  const tenorReadout = useMemo(() => {
    if (!activeTenor) return null
    const rows = [
      {
        label: 'Today',
        yield: todayCurve.find((d) => d.tenor === activeTenor)?.yield ?? null,
        color: CURVE_COLORS.today,
      },
      ...overlays.map((o) => ({
        label: o.label,
        yield: o.data.find((d) => d.tenor === activeTenor)?.yield ?? null,
        color: o.color,
      })),
    ].filter((r) => r.yield !== null)
    return rows
  }, [activeTenor, todayCurve, overlays])

  const getX = (d: CurveChartData) => xScale(d.tenor) ?? 0
  const getY = (d: CurveChartData) => yScale(d.yield) ?? 0

  return (
    <div className="relative select-none">
      <svg
        width={width}
        height={height}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        style={{ overflow: 'visible' }}
      >
        {/* Background */}
        <rect x={0} y={0} width={width} height={height} fill="#07090c" rx={2} />

        <Group left={margin.left} top={margin.top}>
          {/* Grid rows */}
          {showGrid && (
            <GridRows
              scale={yScale}
              width={innerW}
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray="3,4"
            />
          )}

          {/* Overlay curves */}
          <AnimatePresence>
            {overlays.map((overlay) => (
              <motion.g
                key={overlay.id}
                initial={animate ? { opacity: 0 } : { opacity: 0.6 }}
                animate={{ opacity: 0.6 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <LinePath
                  data={overlay.data}
                  x={getX}
                  y={getY}
                  stroke={overlay.color}
                  strokeWidth={1.5}
                  strokeDasharray="5,4"
                  curve={curveMonotoneX}
                />
              </motion.g>
            ))}
          </AnimatePresence>

          {/* Today's curve – glow + main line */}
          <motion.g
            initial={animate ? { opacity: 0 } : { opacity: 1 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
          >
            {/* Glow */}
            <LinePath
              data={todayCurve}
              x={getX}
              y={getY}
              stroke={CURVE_COLORS.today}
              strokeWidth={8}
              strokeOpacity={0.12}
              curve={curveMonotoneX}
            />
            {/* Main */}
            <LinePath
              data={todayCurve}
              x={getX}
              y={getY}
              stroke={CURVE_COLORS.today}
              strokeWidth={2.5}
              curve={curveMonotoneX}
            />
          </motion.g>

          {/* Data points */}
          {showPoints &&
            todayCurve.map((d, i) => {
              const isActive = d.tenor === activeTenor
              return (
                <motion.circle
                  key={d.tenor}
                  cx={getX(d)}
                  cy={getY(d)}
                  r={isActive ? 5 : 3.5}
                  fill={CURVE_COLORS.today}
                  stroke="#07090c"
                  strokeWidth={isActive ? 2 : 1}
                  initial={animate ? { scale: 0 } : { scale: 1 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.015, duration: 0.18 }}
                  style={{
                    filter: isActive ? `drop-shadow(0 0 6px ${CURVE_COLORS.today})` : undefined,
                  }}
                />
              )
            })}

          {/* Overlay data points at active tenor */}
          {activeTenor &&
            overlays.map((o) => {
              const pt = o.data.find((d) => d.tenor === activeTenor)
              if (!pt) return null
              return (
                <circle
                  key={o.id}
                  cx={getX(pt)}
                  cy={getY(pt)}
                  r={4}
                  fill={o.color}
                  stroke="#07090c"
                  strokeWidth={1.5}
                  opacity={0.85}
                />
              )
            })}

          {/* Proximity crosshair */}
          {activeTenor && crosshairX > margin.left && (
            <g>
              <line
                x1={crosshairX - margin.left}
                x2={crosshairX - margin.left}
                y1={0}
                y2={innerH}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <rect
                x={crosshairX - margin.left - 16}
                y={innerH + 4}
                width={32}
                height={14}
                rx={1}
                fill="rgba(255,102,0,0.15)"
                stroke="rgba(255,102,0,0.4)"
                strokeWidth={0.5}
              />
              <text
                x={crosshairX - margin.left}
                y={innerH + 14}
                textAnchor="middle"
                fontSize={8}
                fontFamily="JetBrains Mono, monospace"
                fontWeight={600}
                fill="#ff6600"
              >
                {activeTenor}
              </text>
            </g>
          )}

          {/* Axes */}
          <AxisLeft
            scale={yScale}
            stroke="rgba(255,255,255,0.08)"
            tickStroke="rgba(255,255,255,0.08)"
            tickLabelProps={() => ({
              fill: 'rgba(255,255,255,0.4)',
              fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
              textAnchor: 'end',
              dx: -4,
              dy: 3,
            })}
            tickFormat={(v) => `${v}%`}
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
              dy: 4,
            })}
          />

          {/* Invisible hit area */}
          <rect
            x={0}
            y={0}
            width={innerW}
            height={innerH}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
          />
        </Group>
      </svg>

      {/* Floating readout at active tenor */}
      <AnimatePresence>
        {activeTenor && tenorReadout && tenorReadout.length > 0 && (
          <motion.div
            key={activeTenor}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="tooltip-container absolute pointer-events-none z-10"
            style={{
              left: Math.min(
                crosshairX + 10,
                width - 130,
              ),
              top: Math.max(margin.top, Math.min(rawY - 20, height - 100)),
            }}
          >
            <div className="tenor-label mb-1 text-[11px]">{activeTenor}</div>
            {tenorReadout.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                <span className="w-2 h-2 rounded-sm inline-block" style={{ background: r.color }} />
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{r.label}:</span>
                <span className="text-white font-semibold">{formatYield(r.yield!)}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
