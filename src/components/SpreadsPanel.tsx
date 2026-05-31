'use client'

import { motion } from 'framer-motion'
import { SpreadsData } from '@/types'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface SpreadsPanelProps {
  data: SpreadsData | null
  loading?: boolean
}

const SPREAD_CONFIG: Record<string, { label: string; description: string; importance: 'primary' | 'secondary' | 'tertiary' }> = {
  '2s10s':    { label: '2s10s',    description: '10Y − 2Y',          importance: 'primary' },
  '5s30s':    { label: '5s30s',    description: '30Y − 5Y',          importance: 'secondary' },
  '3m10y':    { label: '3m10y',    description: '10Y − 3M',          importance: 'primary' },
  '2s30s':    { label: '2s30s',    description: '30Y − 2Y',          importance: 'secondary' },
  '2s5s':     { label: '2s5s',     description: '5Y − 2Y',           importance: 'tertiary' },
  '5s10s30s': { label: '5s10s30s', description: '(5Y+30Y)/2 − 10Y',  importance: 'tertiary' },
  '2s5s10s':  { label: '2s5s10s',  description: '(2Y+10Y)/2 − 5Y',   importance: 'tertiary' },
}

function SpreadCard({
  spread,
  config,
  index,
}: {
  spread: { value: number; interpretation: string } | undefined
  config: { label: string; description: string; importance: 'primary' | 'secondary' | 'tertiary' }
  index: number
}) {
  if (!spread) return null

  const isInverted = spread.interpretation === 'inverted'
  const isSteepening = spread.interpretation === 'steepening'
  const isNormal = spread.interpretation === 'normal'

  const Icon = isInverted ? TrendingDown : isSteepening ? TrendingUp : Minus

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      className={`
        panel p-3
        ${config.importance === 'primary' ? 'border-l-2 border-l-orange-500' : ''}
        ${config.importance === 'secondary' ? 'border-l-2 border-l-cyan-500/50' : ''}
      `}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="tenor-label">{config.label}</span>
            <span className="text-xs text-gray-600">{config.description}</span>
          </div>
          <div className={`
            text-2xl font-mono font-bold mt-1
            ${spread.value > 0 ? 'text-green-400' : spread.value < 0 ? 'text-red-400' : 'text-gray-400'}
          `}>
            {spread.value > 0 ? '+' : ''}{spread.value.toFixed(1)}
            <span className="text-sm text-gray-500 ml-1">bp</span>
          </div>
        </div>
        <div className={`
          flex items-center gap-1 px-2 py-1 rounded text-xs font-mono
          ${isInverted ? 'bg-red-500/10 text-red-400' : ''}
          ${isSteepening ? 'bg-green-500/10 text-green-400' : ''}
          ${isNormal ? 'bg-gray-500/10 text-gray-400' : ''}
        `}>
          <Icon className="w-3 h-3" />
          <span className="uppercase">
            {isInverted ? 'Inverted' : isSteepening ? 'Steep' : 'Normal'}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

export default function SpreadsPanel({ data, loading }: SpreadsPanelProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="panel p-3">
            <div className="skeleton h-4 w-20 rounded mb-2" />
            <div className="skeleton h-8 w-24 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="panel p-4 text-center text-gray-500">
        <span className="font-mono text-sm">No spread data available</span>
      </div>
    )
  }

  const spreadsEntries = Object.entries(SPREAD_CONFIG)

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-3">
        <span className="label-orange">KEY SPREADS</span>
        <span className="text-xs text-gray-500 font-mono">
          As of {data.date}
        </span>
      </div>

      {/* Spread cards */}
      {spreadsEntries.map(([key, config], index) => (
        <SpreadCard
          key={key}
          spread={data.spreads[key as keyof typeof data.spreads]}
          config={config}
          index={index}
        />
      ))}

      {/* Inversion warning */}
      {Object.values(data.spreads).some(s => s?.interpretation === 'inverted') && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="panel p-3 border border-red-500/30 bg-red-500/5"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-mono text-red-400">
              CURVE INVERSION DETECTED
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Inverted curves have historically preceded recessions.
          </p>
        </motion.div>
      )}
    </div>
  )
}
