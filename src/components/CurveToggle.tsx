'use client'

import { motion } from 'framer-motion'
import { CurveType } from '@/types'

interface CurveToggleProps {
  value: CurveType
  onChange: (value: CurveType) => void
}

export default function CurveToggle({ value, onChange }: CurveToggleProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-terminal-panel border border-terminal-border rounded">
      <button
        onClick={() => onChange('full')}
        className={`
          relative px-3 py-1.5 text-xs font-mono transition-colors rounded-sm
          ${value === 'full' ? 'text-black' : 'text-gray-500 hover:text-gray-300'}
        `}
      >
        {value === 'full' && (
          <motion.div
            layoutId="curve-toggle-bg"
            className="absolute inset-0 bg-bloomberg-orange rounded-sm"
            transition={{ duration: 0.15 }}
          />
        )}
        <span className="relative z-10">FULL CURVE</span>
      </button>
      <button
        onClick={() => onChange('futures')}
        className={`
          relative px-3 py-1.5 text-xs font-mono transition-colors rounded-sm
          ${value === 'futures' ? 'text-black' : 'text-gray-500 hover:text-gray-300'}
        `}
      >
        {value === 'futures' && (
          <motion.div
            layoutId="curve-toggle-bg"
            className="absolute inset-0 bg-bloomberg-orange rounded-sm"
            transition={{ duration: 0.15 }}
          />
        )}
        <span className="relative z-10">FUTURES</span>
      </button>
    </div>
  )
}
