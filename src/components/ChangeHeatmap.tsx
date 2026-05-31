'use client'

import { useMemo } from 'react'
import { Group } from '@visx/group'
import { scaleBand } from '@visx/scale'
import { motion } from 'framer-motion'
import {
  TimeWindow,
  TENOR_ORDER,
  FUTURES_TENOR_ORDER,
  getHeatmapColor,
  formatBasisPoints,
} from '@/types'

interface ChangeData {
  [window: string]: {
    from_date: string
    to_date: string
    changes: Record<string, number>
  }
}

interface ChangeHeatmapProps {
  data: ChangeData
  windows?: TimeWindow[]
  curveType?: 'full' | 'futures'
  width?: number
  height?: number
  /** Active tenor from proximity (linked to chart) */
  activeTenor?: string | null
  onTenorChange?: (tenor: string | null) => void
}

const margin = { top: 28, right: 12, bottom: 8, left: 44 }

// Tooltip portal state (simple inline tooltip)
interface TooltipState {
  tenor: string
  window: string
  value: number
  fromDate: string
  toDate: string
  x: number
  y: number
}

import { useState } from 'react'

export default function ChangeHeatmap({
  data,
  windows = ['1D', '1W', '1M', '1Y'],
  curveType = 'full',
  width = 600,
  height = 180,
  activeTenor,
  onTenorChange,
}: ChangeHeatmapProps) {
  const tenors = curveType === 'futures' ? FUTURES_TENOR_ORDER : TENOR_ORDER
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const heatmapData = useMemo(
    () =>
      windows.map((win) => {
        const wd = data[win]
        return {
          window: win,
          fromDate: wd?.from_date ?? '',
          toDate: wd?.to_date ?? '',
          bins: tenors.map((tenor) => ({
            tenor,
            value: wd?.changes[tenor] ?? null,
          })),
        }
      }),
    [data, windows, tenors],
  )

  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom

  const xScale = scaleBand<string>({
    domain: tenors,
    range: [0, innerW],
    padding: 0.06,
  })

  const yScale = scaleBand<string>({
    domain: windows,
    range: [0, innerH],
    padding: 0.06,
  })

  const cellW = xScale.bandwidth()
  const cellH = yScale.bandwidth()

  return (
    <div className="relative">
      <svg
        width={width}
        height={height}
        onMouseLeave={() => {
          setTooltip(null)
          onTenorChange?.(null)
        }}
      >
        <rect x={0} y={0} width={width} height={height} fill="#07090c" rx={2} />

        <Group left={margin.left} top={margin.top}>
          {/* Column headers (tenors) */}
          {tenors.map((tenor) => {
            const isActive = activeTenor === tenor
            return (
              <text
                key={`hdr-${tenor}`}
                x={(xScale(tenor) ?? 0) + cellW / 2}
                y={-10}
                textAnchor="middle"
                fill={isActive ? '#ff6600' : '#ffcc00'}
                fontSize={isActive ? 10 : 9}
                fontFamily="JetBrains Mono, monospace"
                fontWeight={isActive ? 700 : 500}
                style={{ transition: 'fill 0.15s' }}
              >
                {tenor}
              </text>
            )
          })}

          {/* Row labels (windows) */}
          {windows.map((win) => (
            <text
              key={`lbl-${win}`}
              x={-8}
              y={(yScale(win) ?? 0) + cellH / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fill="#ff6600"
              fontSize={9}
              fontFamily="JetBrains Mono, monospace"
              fontWeight={600}
              letterSpacing={2}
            >
              {win}
            </text>
          ))}

          {/* Cells */}
          {heatmapData.map((row, ri) =>
            row.bins.map((bin, ci) => {
              const x = xScale(bin.tenor) ?? 0
              const y = yScale(row.window) ?? 0
              const isActive = activeTenor === bin.tenor
              const color =
                bin.value !== null ? getHeatmapColor(bin.value) : 'rgba(255,255,255,0.03)'

              return (
                <motion.g
                  key={`${row.window}-${bin.tenor}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: (ri * tenors.length + ci) * 0.008, duration: 0.15 }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={cellW}
                    height={cellH}
                    fill={color}
                    rx={2}
                    stroke={
                      isActive
                        ? 'rgba(255,102,0,0.7)'
                        : 'rgba(0,0,0,0)'
                    }
                    strokeWidth={isActive ? 1.5 : 0}
                    style={{ cursor: bin.value !== null ? 'default' : 'default' }}
                    onMouseEnter={() => {
                      onTenorChange?.(bin.tenor)
                      if (bin.value !== null) {
                        setTooltip({
                          tenor: bin.tenor,
                          window: row.window,
                          value: bin.value,
                          fromDate: row.fromDate,
                          toDate: row.toDate,
                          x: x + margin.left + cellW / 2,
                          y: y + margin.top,
                        })
                      }
                    }}
                    onMouseLeave={() => {
                      setTooltip(null)
                    }}
                  />

                  {/* Cell value text */}
                  {bin.value !== null && (
                    <text
                      x={x + cellW / 2}
                      y={y + cellH / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={Math.abs(bin.value) > 15 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)'}
                      fontSize={cellW > 44 ? 9 : 7}
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight={500}
                      pointerEvents="none"
                    >
                      {bin.value > 0 ? '+' : ''}{bin.value.toFixed(0)}
                    </text>
                  )}
                </motion.g>
              )
            }),
          )}
        </Group>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="tooltip-container absolute pointer-events-none z-20"
          style={{
            left: Math.min(tooltip.x + 8, width - 140),
            top: Math.max(4, tooltip.y - 10),
          }}
        >
          <div className="tenor-label text-[11px] mb-0.5">
            {tooltip.tenor} · {tooltip.window}
          </div>
          <div
            className="font-mono text-base font-bold"
            style={{ color: tooltip.value > 0 ? '#00cc66' : tooltip.value < 0 ? '#ff3333' : 'rgba(255,255,255,0.4)' }}
          >
            {formatBasisPoints(tooltip.value)}
          </div>
          <div className="font-mono text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {tooltip.fromDate} → {tooltip.toDate}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-[9px] font-mono">
        {[
          { color: '#7a0000', label: '−30+ bp' },
          { color: '#ee5555', label: '−10 bp' },
          { color: '#1a2232', label: '0' },
          { color: '#006644', label: '+10 bp' },
          { color: '#003311', label: '+30+ bp' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
