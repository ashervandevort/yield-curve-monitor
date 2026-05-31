'use client'

import { DisplayUnit, DISPLAY_UNIT_LABELS } from '@/types'

interface UnitToggleProps {
  value: DisplayUnit
  onChange: (unit: DisplayUnit) => void
}

const UNITS: DisplayUnit[] = ['krd', 'years_dur', 'dollars_100bp', 'contracts']

export default function UnitToggle({ value, onChange }: UnitToggleProps) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-terminal-faint border border-terminal-border rounded-[2px]">
      {UNITS.map((unit) => (
        <button
          key={unit}
          onClick={() => onChange(unit)}
          className="relative px-2 py-1 font-mono text-[9px] font-semibold rounded-[1px] tracking-wide transition-all uppercase"
          style={{
            background: value === unit ? '#ff6600' : 'transparent',
            color: value === unit ? '#000' : 'rgba(255,255,255,0.4)',
            letterSpacing: '0.06em',
          }}
        >
          {DISPLAY_UNIT_LABELS[unit]}
        </button>
      ))}
    </div>
  )
}
