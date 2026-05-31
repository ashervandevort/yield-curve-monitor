'use client'

import { useState, useEffect } from 'react'
import { Plus, X, RefreshCw } from 'lucide-react'
import { KeyRateTenor, KEY_RATE_TENORS } from '@/types'
import {
  aggregateLegsToDv01,
  DEFAULT_MOD_DURATION,
} from '@/lib/analytics'

interface Leg {
  id: string
  notional: string       // raw string input
  tenor: KeyRateTenor
  duration: string       // raw string input
  durationAuto: boolean  // true = use DEFAULT_MOD_DURATION[tenor]
  direction: 'long' | 'short'
}

interface PositionBuilderProps {
  /** Called whenever the derived DV01 vector changes */
  onDv01Change: (dv01: Record<string, string>) => void
}

let _legId = 0
function newLegId() {
  return `leg_${++_legId}`
}

function makeLeg(tenor: KeyRateTenor = '10Y'): Leg {
  return {
    id: newLegId(),
    notional: '',
    tenor,
    duration: DEFAULT_MOD_DURATION[tenor].toFixed(2),
    durationAuto: true,
    direction: 'long',
  }
}

export default function PositionBuilder({ onDv01Change }: PositionBuilderProps) {
  const [legs, setLegs] = useState<Leg[]>([makeLeg()])

  // Recompute aggregated DV01 whenever legs change
  useEffect(() => {
    const inputs = legs
      .map((leg) => {
        const notional = parseFloat(leg.notional.replace(/[$,kKmM]/g, '')) || 0
        // Handle shorthand (e.g. "10m", "5M", "100k")
        const rawLower = leg.notional.toLowerCase()
        const multiplied =
          rawLower.endsWith('m')
            ? notional * 1_000_000
            : rawLower.endsWith('k')
              ? notional * 1_000
              : notional
        const duration = parseFloat(leg.duration) || DEFAULT_MOD_DURATION[leg.tenor]
        return { notional: multiplied, tenor: leg.tenor, modDuration: duration, direction: leg.direction }
      })
      .filter((l) => l.notional > 0)

    const aggregated = aggregateLegsToDv01(inputs)
    // Convert to string map for KeyRateGrid
    const asStrings: Record<string, string> = {}
    for (const [tenor, dv01] of Object.entries(aggregated)) {
      asStrings[tenor] = dv01 !== 0 ? Math.round(dv01).toString() : ''
    }
    onDv01Change(asStrings)
  }, [legs, onDv01Change])

  const addLeg = () => setLegs((prev) => [...prev, makeLeg()])

  const removeLeg = (id: string) => setLegs((prev) => prev.filter((l) => l.id !== id))

  const updateLeg = (id: string, patch: Partial<Leg>) => {
    setLegs((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l
        const next = { ...l, ...patch }
        // When tenor changes and duration is auto, update the auto duration
        if (patch.tenor && l.durationAuto) {
          next.duration = DEFAULT_MOD_DURATION[patch.tenor].toFixed(2)
        }
        return next
      }),
    )
  }

  const clearAll = () => {
    setLegs([makeLeg()])
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="stat-label">POSITION LEGS → KRD</span>
        <div className="flex items-center gap-1">
          <button onClick={clearAll} className="btn-terminal text-[10px] px-2 py-1">
            CLEAR
          </button>
          <button onClick={addLeg} className="btn-terminal text-[10px] px-2 py-1 flex items-center gap-1">
            <Plus className="w-3 h-3" />
            ADD LEG
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-12 gap-1 px-0.5">
        <div className="col-span-1 stat-label text-[9px]">DIR</div>
        <div className="col-span-4 stat-label text-[9px]">NOTIONAL</div>
        <div className="col-span-3 stat-label text-[9px]">TENOR</div>
        <div className="col-span-3 stat-label text-[9px]">MOD DUR</div>
        <div className="col-span-1" />
      </div>

      {/* Legs */}
        {legs.map((leg) => {
        return (
          <div
            key={leg.id}
            className="grid grid-cols-12 gap-1 items-center py-1 border-b border-terminal-border last:border-0"
          >
            {/* Direction toggle */}
            <div className="col-span-1">
              <button
                onClick={() =>
                  updateLeg(leg.id, {
                    direction: leg.direction === 'long' ? 'short' : 'long',
                  })
                }
                className="w-full text-center font-mono font-semibold rounded-sm py-0.5"
                style={{
                  fontSize: '9px',
                  background: leg.direction === 'long'
                    ? 'rgba(0,204,102,0.12)'
                    : 'rgba(255,51,51,0.12)',
                  color: leg.direction === 'long' ? '#00cc66' : '#ff3333',
                  border: `1px solid ${leg.direction === 'long' ? 'rgba(0,204,102,0.25)' : 'rgba(255,51,51,0.25)'}`,
                }}
              >
                {leg.direction === 'long' ? 'L' : 'S'}
              </button>
            </div>

            {/* Notional */}
            <div className="col-span-4">
              <input
                type="text"
                value={leg.notional}
                onChange={(e) => updateLeg(leg.id, { notional: e.target.value })}
                placeholder="100M"
                className="input-terminal text-right w-full"
                style={{ fontSize: '11px', padding: '3px 5px' }}
              />
            </div>

            {/* Tenor select */}
            <div className="col-span-3">
              <select
                value={leg.tenor}
                onChange={(e) =>
                  updateLeg(leg.id, { tenor: e.target.value as KeyRateTenor })
                }
                className="select-terminal w-full"
                style={{ fontSize: '11px', padding: '3px 22px 3px 5px' }}
              >
                {KEY_RATE_TENORS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Duration */}
            <div className="col-span-3 relative">
              <input
                type="text"
                value={leg.duration}
                onChange={(e) =>
                  updateLeg(leg.id, { duration: e.target.value, durationAuto: false })
                }
                className="input-terminal text-right w-full"
                style={{
                  fontSize: '11px',
                  padding: '3px 5px',
                  color: leg.durationAuto ? 'rgba(255,255,255,0.4)' : '#ffffff',
                }}
              />
              {!leg.durationAuto && (
                <button
                  onClick={() =>
                    updateLeg(leg.id, {
                      duration: DEFAULT_MOD_DURATION[leg.tenor].toFixed(2),
                      durationAuto: true,
                    })
                  }
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 opacity-40 hover:opacity-80"
                  title="Reset to default"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                </button>
              )}
            </div>

            {/* Remove */}
            <div className="col-span-1 flex justify-end">
              <button
                onClick={() => removeLeg(leg.id)}
                disabled={legs.length === 1}
                className="opacity-30 hover:opacity-70 disabled:opacity-10"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )
      })}

      {/* DV01 preview summary */}
      {legs.some((l) => parseFloat(l.notional) > 0) && (
        <div className="pt-1 flex items-center justify-between">
          <span className="stat-label text-[9px]">TOTAL DV01 CONTRIBUTION</span>
          <span
            className="font-mono text-xs"
            style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: '9px',
            }}
          >
            ↓ reflected in grid below
          </span>
        </div>
      )}
    </div>
  )
}
