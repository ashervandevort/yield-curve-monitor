'use client'

import { motion } from 'framer-motion'
import { CURVE_COLORS } from '@/types'

interface OverlaySelectorProps {
  selected: string[]
  onChange: (selected: string[]) => void
}

const OVERLAYS = [
  { id: '1D', label: '1D Ago', color: CURVE_COLORS['1D'] },
  { id: '1W', label: '1W Ago', color: CURVE_COLORS['1W'] },
  { id: '1M', label: '1M Ago', color: CURVE_COLORS['1M'] },
  { id: '1Y', label: '1Y Ago', color: CURVE_COLORS['1Y'] },
]

export default function OverlaySelector({ selected, onChange }: OverlaySelectorProps) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center sm:justify-end gap-1.5 sm:gap-2">
      <span className="text-xs text-gray-500 font-mono w-full sm:w-auto text-center sm:text-left">COMPARE:</span>
      {OVERLAYS.map(overlay => (
        <button
          key={overlay.id}
          onClick={() => toggle(overlay.id)}
          className={`
            flex items-center gap-1.5 px-2 py-1 text-xs font-mono rounded-sm
            border transition-all
            ${selected.includes(overlay.id) 
              ? 'border-gray-500 bg-gray-800' 
              : 'border-gray-700 hover:border-gray-600'}
          `}
        >
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: overlay.color }}
            animate={{ 
              opacity: selected.includes(overlay.id) ? 1 : 0.4,
              scale: selected.includes(overlay.id) ? 1 : 0.8,
            }}
          />
          <span className={selected.includes(overlay.id) ? 'text-white' : 'text-gray-500'}>
            {overlay.label}
          </span>
        </button>
      ))}
    </div>
  )
}
