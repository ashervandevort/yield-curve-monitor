'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ScenarioRow } from '@/types'

interface ScenarioPanelProps {
  scenarios: ScenarioRow[]
}

function pnlColor(v: number): string {
  if (v > 0) return '#00cc66'
  if (v < 0) return '#ff3333'
  return 'rgba(255,255,255,0.35)'
}

function fmt(v: number): string {
  const sign = v > 0 ? '+' : ''
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(v / 1_000).toFixed(1)}k`
  return `${sign}$${v.toFixed(0)}`
}

// Group scenarios for collapsible display
const GROUPS: { label: string; subtitle?: string; names: string[] }[] = [
  {
    label: 'Fed / Parallel',
    subtitle: 'rate hikes & cuts',
    names: [
      'parallel_-25', 'parallel_-50', 'parallel_-100', 'parallel_-200',
      'parallel_+25', 'parallel_+50', 'parallel_+100', 'parallel_+200',
    ],
  },
  {
    label: 'Curve Shape',
    subtitle: 'steepening & flattening',
    names: ['steepener_25', 'flattener_25', 'bear_steepener', 'bull_flattener'],
  },
  {
    label: 'Belly',
    subtitle: 'mid-curve moves',
    names: ['belly_selloff', 'belly_rally'],
  },
]

export default function ScenarioPanel({ scenarios }: ScenarioPanelProps) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['Fed / Parallel']))

  const toggle = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const byName = Object.fromEntries(scenarios.map((s) => [s.name, s]))

  return (
    <div className="space-y-0.5">
      {/* Header row */}
      <div className="grid grid-cols-5 gap-1 px-2 py-1.5">
        <div className="col-span-2 stat-label text-[9px]">SCENARIO</div>
        <div className="stat-label text-[9px] text-right">PRE-HEDGE</div>
        <div className="stat-label text-[9px] text-right">HEDGE</div>
        <div className="stat-label text-[9px] text-right">NET</div>
      </div>

      {GROUPS.map(({ label, subtitle, names }) => {
        const rows = names.map((n) => byName[n]).filter(Boolean)
        if (!rows.length) return null
        const isOpen = openGroups.has(label)

        return (
          <div key={label}>
            {/* Group header */}
            <button
              onClick={() => toggle(label)}
              className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-white/[0.02] transition-colors"
            >
              {isOpen ? (
                <ChevronDown className="w-3 h-3 text-bloomberg-orange" />
              ) : (
                <ChevronRight className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
              )}
              <span
                className="font-mono text-[9px] font-semibold uppercase tracking-wider"
                style={{ color: isOpen ? '#ff6600' : 'rgba(255,255,255,0.3)' }}
              >
                {label}
              </span>
              {subtitle && (
                <span className="font-mono text-[8px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  · {subtitle}
                </span>
              )}
            </button>

            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  {rows.map((row) => (
                    <div
                      key={row.name}
                      className="grid grid-cols-5 gap-1 px-2 py-1 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015]"
                    >
                      <div
                        className="col-span-2 font-mono text-[10px]"
                        style={{ color: 'rgba(255,255,255,0.55)' }}
                      >
                        {row.label}
                      </div>
                      <div
                        className="font-mono text-[11px] font-medium text-right"
                        style={{ color: pnlColor(row.pre_hedge) }}
                      >
                        {fmt(row.pre_hedge)}
                      </div>
                      <div
                        className="font-mono text-[11px] font-medium text-right"
                        style={{ color: pnlColor(row.hedge_pnl) }}
                      >
                        {fmt(row.hedge_pnl)}
                      </div>
                      <div
                        className="font-mono text-[11px] font-bold text-right"
                        style={{ color: pnlColor(row.net_pnl) }}
                      >
                        {fmt(row.net_pnl)}
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
