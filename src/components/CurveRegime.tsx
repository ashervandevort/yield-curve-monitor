'use client'

import { motion } from 'framer-motion'

interface RegimeData {
  level: number
  slope: number
  curvature: number
  label: string
}

interface CurveRegimeProps {
  regime: RegimeData | null | undefined
  loading?: boolean
}

const LABEL_COLOR: Record<string, string> = {
  INVERTED: '#ff3333',
  FLAT:     '#ff9900',
  HUMPED:   '#9966ff',
  NORMAL:   '#00cc66',
}

function Bar({
  value,
  max,
}: {
  value: number
  max: number
}) {
  const pct = Math.min(100, (Math.abs(value) / max) * 100)
  const isPos = value >= 0
  return (
    <div className="flex items-center gap-2 mt-0.5">
      {/* negative side */}
      <div className="flex-1 h-1 bg-white/[0.05] rounded-full overflow-hidden flex justify-end">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: isPos ? '0%' : `${pct}%`,
            background: '#ff3333',
            opacity: 0.7,
          }}
        />
      </div>
      {/* positive side */}
      <div className="flex-1 h-1 bg-white/[0.05] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: isPos ? `${pct}%` : '0%',
            background: '#00cc66',
            opacity: 0.7,
          }}
        />
      </div>
    </div>
  )
}

export default function CurveRegime({ regime, loading }: CurveRegimeProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-6 rounded" />
        ))}
      </div>
    )
  }

  if (!regime) {
    return (
      <div className="text-center py-4">
        <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          No regime data
        </span>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="space-y-3"
    >
      {/* Regime label */}
      <div className="flex items-center justify-between">
        <span className="stat-label">REGIME</span>
        <span
          className="font-mono text-xs font-bold px-2 py-0.5 rounded-[2px]"
          style={{
            color: LABEL_COLOR[regime.label] ?? '#00cccc',
            background: `${LABEL_COLOR[regime.label] ?? '#00cccc'}15`,
            border: `1px solid ${LABEL_COLOR[regime.label] ?? '#00cccc'}30`,
            letterSpacing: '0.08em',
          }}
        >
          {regime.label}
        </span>
      </div>

      {/* Level */}
      <div>
        <div className="flex items-center justify-between">
          <span className="stat-label">LEVEL (AVG YIELD)</span>
          <span className="font-mono text-sm font-semibold" style={{ color: '#00cccc' }}>
            {regime.level.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Slope (2s10s equivalent) */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <span className="stat-label">SLOPE (10Y−2Y)</span>
          <span
            className="font-mono text-sm font-semibold"
            style={{ color: regime.slope >= 0 ? '#00cc66' : '#ff3333' }}
          >
            {regime.slope > 0 ? '+' : ''}{regime.slope.toFixed(1)} bp
          </span>
        </div>
        <Bar value={regime.slope} max={150} />
      </div>

      {/* Curvature */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <span className="stat-label">CURVATURE (BFLY)</span>
          <span
            className="font-mono text-sm font-semibold"
            style={{ color: regime.curvature >= 0 ? '#9966ff' : '#ff9900' }}
          >
            {regime.curvature > 0 ? '+' : ''}{regime.curvature.toFixed(1)} bp
          </span>
        </div>
        <Bar value={regime.curvature} max={50} />
      </div>
    </motion.div>
  )
}
