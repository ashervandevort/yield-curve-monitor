'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ScenarioRow } from '@/types'
import ScenarioPnLChart, { pnlColor } from './ScenarioPnLChart'
import ChartContainer from './ChartContainer'

interface ScenarioPanelProps {
  scenarios: ScenarioRow[]
}

function fmt(v: number): string {
  const sign = v > 0 ? '+' : ''
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(v / 1_000).toFixed(1)}k`
  return `${sign}$${v.toFixed(0)}`
}

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
    <div className="space-y-3">
      <div className="px-2 py-2 rounded-[2px] bg-white/[0.02] border border-white/[0.05]">
        <p className="font-mono text-[9px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
          <span style={{ color: '#00cccc' }}>Target book</span> — P&amp;L on your entered KRD target only.{' '}
          <span style={{ color: '#9966ff' }}>Futures book</span> — P&amp;L on optimized futures DV01 profile.{' '}
          <span style={{ color: '#ff6600' }}>Combined</span> — both legs held together (target + futures).{' '}
          <span style={{ color: '#ffcc00' }}>Net exposure</span> — residual unhedged DV01 (target − achieved).
          Formula: P&amp;L = −Σ(DV01 × shock bp). Optimizer <em>matches</em> target exposure; it does not automatically flip sign.
        </p>
      </div>

      <ChartContainer>
        {(width) => <ScenarioPnLChart scenarios={scenarios} width={width} height={220} />}
      </ChartContainer>

      <div className="grid grid-cols-6 gap-1 px-2 py-1.5">
        <div className="col-span-2 stat-label text-[9px]">SCENARIO</div>
        <div className="stat-label text-[9px] text-right">TARGET</div>
        <div className="stat-label text-[9px] text-right">FUTURES</div>
        <div className="stat-label text-[9px] text-right">COMBINED</div>
        <div className="stat-label text-[9px] text-right">NET EXP</div>
      </div>

      {GROUPS.map(({ label, subtitle, names }) => {
        const rows = names.map((n) => byName[n]).filter(Boolean)
        if (!rows.length) return null
        const isOpen = openGroups.has(label)

        return (
          <div key={label}>
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
                      className="grid grid-cols-6 gap-1 px-2 py-1 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015]"
                    >
                      <div className="col-span-2 font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                        {row.label}
                      </div>
                      <div className="font-mono text-[11px] font-medium text-right" style={{ color: pnlColor(row.pre_hedge) }}>
                        {fmt(row.pre_hedge)}
                      </div>
                      <div className="font-mono text-[11px] font-medium text-right" style={{ color: pnlColor(row.hedge_pnl) }}>
                        {fmt(row.hedge_pnl)}
                      </div>
                      <div className="font-mono text-[11px] font-medium text-right" style={{ color: pnlColor(row.combined_pnl ?? 0) }}>
                        {fmt(row.combined_pnl ?? row.pre_hedge + row.hedge_pnl)}
                      </div>
                      <div className="font-mono text-[11px] font-bold text-right" style={{ color: pnlColor(row.net_pnl) }}>
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
