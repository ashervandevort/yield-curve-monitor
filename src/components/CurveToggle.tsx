'use client'

import { motion } from 'framer-motion'
import { CurveType } from '@/types'

interface CurveToggleProps {
  value: CurveType
  onChange: (value: CurveType) => void
}

const OPTIONS: { id: CurveType; title: string; subtitle: string }[] = [
  { id: 'full', title: 'Spot Curve', subtitle: '11 FRED tenors' },
  { id: 'futures', title: 'Futures', subtitle: 'ZT · ZF · ZN · TN · ZB · UB' },
]

export default function CurveToggle({ value, onChange }: CurveToggleProps) {
  const inactive = OPTIONS.find((o) => o.id !== value)

  return (
    <div className="flex flex-col items-center gap-1 w-full sm:w-auto">
      <div className="flex items-center gap-1 p-1 bg-terminal-panel border border-terminal-border rounded w-full sm:w-auto justify-center">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`
              relative px-3 py-1.5 text-xs font-mono transition-colors rounded-sm min-w-[100px]
              ${value === opt.id ? 'text-black' : 'text-gray-500 hover:text-gray-300'}
            `}
          >
            {value === opt.id && (
              <motion.div
                layoutId="curve-toggle-bg"
                className="absolute inset-0 bg-bloomberg-orange rounded-sm"
                transition={{ duration: 0.15 }}
              />
            )}
            <span className="relative z-10 block font-semibold">{opt.title}</span>
          </button>
        ))}
      </div>
      <div className="font-mono text-[9px] text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>
        <span style={{ color: 'rgba(255,102,0,0.85)' }}>
          {OPTIONS.find((o) => o.id === value)?.subtitle}
        </span>
        {inactive && (
          <span className="hidden sm:inline">
            {' '}
            · switch to {inactive.title.toLowerCase()} ({inactive.subtitle})
          </span>
        )}
      </div>
    </div>
  )
}
