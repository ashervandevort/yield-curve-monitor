'use client'

import { motion } from 'framer-motion'
import { CurveType } from '@/types'

interface CurveToggleProps {
  value: CurveType
  onChange: (value: CurveType) => void
}

const OPTIONS: { id: CurveType; label: string; hint: string }[] = [
  { id: 'full', label: 'Spot', hint: 'FRED CMT · 11 tenors' },
  { id: 'futures', label: 'Futures', hint: 'yfinance · CTD-implied yields' },
]

export default function CurveToggle({ value, onChange }: CurveToggleProps) {
  return (
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-[2px] w-full sm:w-auto"
      style={{ background: '#0f1318', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className="relative px-3 sm:px-4 py-2 font-mono text-[10px] sm:text-xs font-semibold rounded-[1px] uppercase tracking-wider transition-colors min-w-[88px] sm:min-w-[96px]"
            style={{
              color: active ? '#000' : 'rgba(255,255,255,0.45)',
              letterSpacing: '0.07em',
            }}
            title={opt.hint}
          >
            {active && (
              <motion.div
                layoutId="curve-type-toggle"
                className="absolute inset-0 rounded-[1px]"
                style={{ background: '#ff6600' }}
                transition={{ duration: 0.15 }}
              />
            )}
            <span className="relative z-10 block">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
