'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  HedgeResult,
  KEY_RATE_TENORS,
  KeyRateTenor,
  DisplayUnit,
  DISPLAY_UNIT_LABELS,
} from '@/types'
import { convertUnit, formatUnit } from '@/lib/analytics'
import { Panel } from '@/components/Panel'
import KeyRateGrid from '@/components/KeyRateGrid'
import PositionBuilder from '@/components/PositionBuilder'
import UnitToggle from '@/components/UnitToggle'
import KrdProfileChart from '@/components/KrdProfileChart'
import ScenarioPanel from '@/components/ScenarioPanel'
import {
  Calculator,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Info,
} from 'lucide-react'

// ── Instrument config (static fallback; overridden by /api/hedge/instruments) ──

interface InstrumentMeta {
  symbol: string
  name: string
  fullName: string
  dv01: number
  contractSize: number
  durationEquiv: number   // approx modified duration (years)
  primaryTenor: string
  deliverable: string
  exposures: Record<string, number>   // key-rate DV01 by tenor
}

const INSTRUMENTS_FALLBACK: InstrumentMeta[] = [
  { symbol: 'ZT', name: '2Y Note',    fullName: '2-Year Treasury Note',    dv01: 38,  contractSize: 200_000, durationEquiv: 1.9,  primaryTenor: '2Y',  deliverable: '1.75–2.25yr T-Notes', exposures: { '2Y': 34.0, '3Y': 4.0 } },
  { symbol: 'ZF', name: '5Y Note',    fullName: '5-Year Treasury Note',    dv01: 47,  contractSize: 100_000, durationEquiv: 4.7,  primaryTenor: '5Y',  deliverable: '4.25–5.25yr T-Notes', exposures: { '2Y': 3.0, '3Y': 5.0, '5Y': 36.0, '7Y': 3.0 } },
  { symbol: 'ZN', name: '10Y Note',   fullName: '10-Year Treasury Note',   dv01: 78,  contractSize: 100_000, durationEquiv: 7.8,  primaryTenor: '10Y', deliverable: '6.5–10yr T-Notes', exposures: { '5Y': 6.0, '7Y': 10.0, '10Y': 58.0, '20Y': 4.0 } },
  { symbol: 'TN', name: 'Ultra 10Y',  fullName: 'Ultra 10-Year T-Note',   dv01: 95,  contractSize: 100_000, durationEquiv: 9.5,  primaryTenor: '10Y', deliverable: '10+ yr T-Notes (>10yr)', exposures: { '5Y': 3.0, '7Y': 8.0, '10Y': 74.0, '20Y': 10.0 } },
  { symbol: 'ZB', name: '30Y Bond',   fullName: '30-Year Treasury Bond',   dv01: 165, contractSize: 100_000, durationEquiv: 16.5, primaryTenor: '30Y', deliverable: '15–25yr T-Bonds', exposures: { '10Y': 12.0, '20Y': 28.0, '30Y': 125.0 } },
  { symbol: 'UB', name: 'Ultra Bond', fullName: 'Ultra T-Bond (Long Bond)', dv01: 230, contractSize: 100_000, durationEquiv: 23.0, primaryTenor: '30Y', deliverable: '25+ yr T-Bonds', exposures: { '10Y': 6.0, '20Y': 16.0, '30Y': 208.0 } },
]

// ── KRD mini-chart ─────────────────────────────────────────────────────────────

function KrdMiniChart({
  exposures,
  dv01Total,
}: {
  exposures: Record<string, number>
  dv01Total: number
}) {
  const tenors = ['2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y']
  const values = tenors.map((t) => exposures[t] ?? 0)
  const max = Math.max(...values, 1)
  const w = 148, h = 56, barW = 16, gap = 5

  return (
    <svg width={w} height={h} className="mt-1.5">
      {tenors.map((t, i) => {
        const v = values[i]
        const bh = Math.max(2, (v / max) * (h - 14))
        const x = i * (barW + gap)
        const y = h - 12 - bh
        return (
          <g key={t}>
            <rect
              x={x} y={y} width={barW} height={bh}
              rx={1}
              fill={v > 0 ? '#ff6600' : 'rgba(255,255,255,0.1)'}
              opacity={v > 0 ? 0.85 : 0.3}
            />
            {v > 0 && (
              <text
                x={x + barW / 2} y={y - 2}
                textAnchor="middle"
                fontSize="6.5"
                fill="rgba(255,153,0,0.7)"
                fontFamily="JetBrains Mono, monospace"
              >
                {v}
              </text>
            )}
            <text
              x={x + barW / 2} y={h - 1}
              textAnchor="middle"
              fontSize="7"
              fill="rgba(255,255,255,0.3)"
              fontFamily="JetBrains Mono, monospace"
            >
              {t.replace('Y', '')}
            </text>
          </g>
        )
      })}
      <text x={w - 2} y={9} textAnchor="end" fontSize="7" fill="rgba(255,255,255,0.2)" fontFamily="JetBrains Mono, monospace">
        ${dv01Total}/bp
      </text>
    </svg>
  )
}

// ── Optimization mode presets ──────────────────────────────────────────────────

interface OptimMode {
  id: string
  label: string
  description: string
  tooltip: string
  penalty: number
  maxContracts: number
  residualTol: number
}

const OPT_MODES: OptimMode[] = [
  {
    id: 'accurate',
    label: 'FULL HEDGE',
    description: 'Minimize residual across all 7 key rates. Best coverage, may use more contracts.',
    tooltip: 'Pure least-squares: minimizes Σ(target_dv01 − achieved_dv01)². No limit on contracts.',
    penalty: 0,
    maxContracts: 1000,
    residualTol: 1000,
  },
  {
    id: 'lean',
    label: 'LEAN',
    description: 'Small contract penalty prefers fewer, simpler positions. Slightly wider residual.',
    tooltip: 'Adds a per-contract penalty to the objective: Σresidual² + 50·Σ|contracts|. Favors 1-2 instruments.',
    penalty: 50,
    maxContracts: 200,
    residualTol: 2000,
  },
  {
    id: 'balanced',
    label: 'BALANCED',
    description: 'Middle ground — moderate penalty, up to 500 contracts per instrument.',
    tooltip: 'Penalty = 10, max = 500. Trades off coverage vs. position complexity.',
    penalty: 10,
    maxContracts: 500,
    residualTol: 1500,
  },
  {
    id: 'custom',
    label: 'CUSTOM',
    description: 'Set penalty, max contracts, and tolerance manually.',
    tooltip: 'Override all optimizer parameters directly.',
    penalty: 0,
    maxContracts: 1000,
    residualTol: 1000,
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt$(v: number): string {
  const sign = v > 0 ? '+' : ''
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${sign}$${(v / 1_000).toFixed(1)}k`
  return `${sign}$${v.toFixed(0)}`
}

function fmtNotional(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)         return `$${(v / 1_000).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

function signColor(v: number): string {
  if (v > 0) return '#00cc66'
  if (v < 0) return '#ff3333'
  return 'rgba(255,255,255,0.35)'
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function HedgeOptimizer() {
  // ── Instrument data (loaded from backend) ─────────────────────────────────
  const [instruments, setInstruments] = useState<InstrumentMeta[]>(INSTRUMENTS_FALLBACK)

  useEffect(() => {
    fetch('/api/hedge/instruments')
      .then((r) => r.json())
      .then((data) => {
        if (!data.success || !data.instruments) return
        const mapped: InstrumentMeta[] = data.instruments.map(
          (inst: {
            symbol: string; name: string; contract_size: number;
            dv01_approx: number; tenor_mapping: string;
            key_rate_exposures: Record<string, number>
          }) => {
            const fallback = INSTRUMENTS_FALLBACK.find((f) => f.symbol === inst.symbol)
            const contractSize = inst.contract_size ?? fallback?.contractSize ?? 100_000
            const dv01 = inst.dv01_approx ?? fallback?.dv01 ?? 0
            return {
              symbol: inst.symbol,
              name: fallback?.name ?? inst.name,
              fullName: inst.name,
              dv01,
              contractSize,
              // Duration equiv = DV01 / (face_value * 0.01%) — derives from backend DV01
              durationEquiv: Math.round((dv01 / (contractSize * 0.0001)) * 10) / 10,
              primaryTenor: inst.tenor_mapping,
              deliverable: fallback?.deliverable ?? '',
              exposures: inst.key_rate_exposures ?? {},
            }
          },
        )
        setInstruments(mapped)
      })
      .catch(() => { /* keep fallback */ })
  }, [])

  // ── Input state ────────────────────────────────────────────────────────────
  const [targetDv01, setTargetDv01] = useState<Record<string, string>>(
    Object.fromEntries(KEY_RATE_TENORS.map((t) => [t, ''])),
  )
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>(['ZT', 'ZF', 'ZN', 'ZB'])
  const [optMode, setOptMode] = useState<string>('accurate')
  const [maxContracts, setMaxContracts] = useState('1000')
  const [residualTolerance, setResidualTolerance] = useState('1000')
  const [penaltyPerContract, setPenaltyPerContract] = useState('0')
  const [currentPositions, setCurrentPositions] = useState<Record<string, string>>({})
  const [showRebalance, setShowRebalance] = useState(false)
  const [usePositionBuilder, setUsePositionBuilder] = useState(false)
  const [hoveredInstrument, setHoveredInstrument] = useState<string | null>(null)

  // ── Display state ──────────────────────────────────────────────────────────
  const [unit, setUnit] = useState<DisplayUnit>('krd')
  const [activeTenor, setActiveTenor] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['positions', 'analysis']),
  )

  // ── Result state ───────────────────────────────────────────────────────────
  const [result, setResult] = useState<HedgeResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleSection = (key: string) =>
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleInstrument = (sym: string) =>
    setSelectedInstruments((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym],
    )

  // Apply preset when mode changes
  const applyMode = (modeId: string) => {
    const preset = OPT_MODES.find((m) => m.id === modeId)
    if (!preset || modeId === 'custom') { setOptMode(modeId); return }
    setOptMode(modeId)
    setMaxContracts(String(preset.maxContracts))
    setResidualTolerance(String(preset.residualTol))
    setPenaltyPerContract(String(preset.penalty))
  }

  const handlePositionBuilderDv01 = useCallback(
    (dv01: Record<string, string>) => setTargetDv01((prev) => ({ ...prev, ...dv01 })),
    [],
  )

  const clearAll = () => {
    setTargetDv01(Object.fromEntries(KEY_RATE_TENORS.map((t) => [t, ''])))
    setResult(null)
    setError(null)
  }

  const handleOptimize = useCallback(async () => {
    setLoading(true)
    setError(null)

    const numericTarget: Record<string, number> = {}
    for (const [tenor, value] of Object.entries(targetDv01)) {
      if (value !== '') {
        const n = parseFloat(value)
        if (!isNaN(n)) numericTarget[tenor] = n
      }
    }

    if (Object.keys(numericTarget).length === 0) {
      setError('Enter at least one target DV01 value to optimize.')
      setLoading(false)
      return
    }

    const numericCurrentPositions: Record<string, number> | undefined = showRebalance
      ? Object.fromEntries(
          Object.entries(currentPositions)
            .map(([k, v]) => [k, parseInt(v, 10)])
            .filter(([, v]) => !isNaN(v as number)),
        )
      : undefined

    try {
      const response = await fetch('/api/hedge/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_dv01: numericTarget,
          instruments: selectedInstruments,
          max_contracts: parseInt(maxContracts, 10) || 1000,
          residual_tolerance: parseInt(residualTolerance, 10) || 1000,
          penalty_per_contract: parseFloat(penaltyPerContract) || 0,
          current_positions: numericCurrentPositions,
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || data.detail || `HTTP ${response.status}`)
      }
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [
    targetDv01, selectedInstruments, maxContracts,
    residualTolerance, penaltyPerContract, currentPositions, showRebalance,
  ])

  const refNotional = 100_000_000
  const activePreset = OPT_MODES.find((m) => m.id === optMode)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-11 gap-3">

      {/* ══ LEFT: Inputs ═══════════════════════════════════════════════════════ */}
      <div className="xl:col-span-5 space-y-3">

        {/* Input mode toggle */}
        <div className="flex items-center gap-1 p-0.5 bg-terminal-faint border border-terminal-border rounded-[2px] w-fit">
          {(['Direct KRD', 'Position Builder'] as const).map((label, i) => {
            const active = i === 0 ? !usePositionBuilder : usePositionBuilder
            return (
              <button
                key={label}
                onClick={() => setUsePositionBuilder(i === 1)}
                className="px-3 py-1 font-mono text-[10px] font-semibold rounded-[1px] uppercase tracking-wider transition-all"
                style={{
                  background: active ? '#ff6600' : 'transparent',
                  color: active ? '#000' : 'rgba(255,255,255,0.4)',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        <AnimatePresence>
          {usePositionBuilder && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.13 }}
            >
              <Panel title="Position Builder" subtitle="notional × duration → KRD" bodyClassName="panel-body-sm">
                <PositionBuilder onDv01Change={handlePositionBuilderDv01} />
              </Panel>
            </motion.div>
          )}
        </AnimatePresence>

        {/* KRD grid */}
        <Panel
          title="Target KRD ($/bp)"
          subtitle="7-point key-rate grid"
          bodyClassName="panel-body-sm"
          actions={
            <button onClick={clearAll} className="btn-terminal text-[9px] px-2 py-0.5">CLEAR</button>
          }
        >
          <KeyRateGrid values={targetDv01} onChange={setTargetDv01} activeTenor={activeTenor} />
          <p className="text-[9px] font-mono mt-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
            + = long duration (pays if rates fall) · − = short duration
          </p>
        </Panel>

        {/* Instruments */}
        <Panel title="Instruments" subtitle="click to toggle" bodyClassName="panel-body-sm">
          <div className="grid grid-cols-2 gap-1.5">
            {instruments.map((inst) => {
              const active = selectedInstruments.includes(inst.symbol)
              const hovered = hoveredInstrument === inst.symbol
              return (
                <button
                  key={inst.symbol}
                  onClick={() => toggleInstrument(inst.symbol)}
                  onMouseEnter={() => setHoveredInstrument(inst.symbol)}
                  onMouseLeave={() => setHoveredInstrument(null)}
                  className={`text-left px-2.5 py-2 rounded-[2px] border transition-all ${
                    active
                      ? 'border-bloomberg-orange bg-bloomberg-orange/10'
                      : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className="font-mono font-bold text-[12px]"
                      style={{ color: active ? '#ff6600' : 'rgba(255,255,255,0.7)' }}
                    >
                      {inst.symbol}
                    </span>
                    <span
                      className="font-mono text-[9px]"
                      style={{ color: active ? '#ff9900' : 'rgba(255,255,255,0.3)' }}
                    >
                      ${inst.dv01}/bp
                    </span>
                  </div>
                  <div className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {inst.name}
                  </div>
                  <div className="font-mono text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
                    ~{inst.durationEquiv}yr dur · {inst.primaryTenor}
                  </div>
                  {/* KRD mini-chart: always shown when active or hovered */}
                  <AnimatePresence>
                    {(active || hovered) && Object.keys(inst.exposures).length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.1 }}
                      >
                        <KrdMiniChart exposures={inst.exposures} dv01Total={inst.dv01} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* Deliverable basket on hover */}
                  <AnimatePresence>
                    {hovered && inst.deliverable && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.1 }}
                        className="font-mono text-[8px] mt-1 pt-1 border-t border-white/[0.07]"
                        style={{ color: 'rgba(255,255,255,0.25)' }}
                      >
                        {inst.deliverable}
                        {' · '}{inst.contractSize === 200_000 ? '$200k' : '$100k'} face
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              )
            })}
          </div>
        </Panel>

        {/* Optimization mode */}
        <Panel title="Optimization Mode" bodyClassName="panel-body-sm">
          <div className="grid grid-cols-4 gap-1 mb-2">
            {OPT_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => applyMode(mode.id)}
                className="text-center py-1.5 rounded-[2px] border transition-all font-mono text-[9px] font-semibold uppercase tracking-wider"
                style={{
                  background: optMode === mode.id ? '#ff6600' : 'rgba(255,255,255,0.03)',
                  borderColor: optMode === mode.id ? '#ff6600' : 'rgba(255,255,255,0.08)',
                  color: optMode === mode.id ? '#000' : 'rgba(255,255,255,0.4)',
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {activePreset && (
            <p className="font-mono text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.38)' }}>
              {activePreset.description}
            </p>
          )}

          {/* Custom controls (always shown for custom mode, collapsed for others) */}
          <AnimatePresence>
            {optMode === 'custom' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.12 }}
                className="mt-2 space-y-2"
              >
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="stat-label block mb-0.5">MAX CONTRACTS</label>
                    <input
                      type="text"
                      value={maxContracts}
                      onChange={(e) => setMaxContracts(e.target.value.replace(/[^\d]/g, ''))}
                      className="input-terminal text-right"
                    />
                  </div>
                  <div>
                    <label className="stat-label block mb-0.5">TOLERANCE</label>
                    <input
                      type="text"
                      value={residualTolerance}
                      onChange={(e) => setResidualTolerance(e.target.value.replace(/[^\d]/g, ''))}
                      className="input-terminal text-right"
                    />
                  </div>
                  <div>
                    <label className="stat-label block mb-0.5">PENALTY</label>
                    <input
                      type="text"
                      value={penaltyPerContract}
                      onChange={(e) => setPenaltyPerContract(e.target.value.replace(/[^\d.]/g, ''))}
                      className="input-terminal text-right"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Show effective settings for non-custom modes */}
          {optMode !== 'custom' && activePreset && (
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/[0.05]">
              {[
                { label: 'penalty', val: activePreset.penalty },
                { label: 'max cts', val: activePreset.maxContracts },
                { label: 'tol', val: activePreset.residualTol },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-center gap-1">
                  <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{label}:</span>
                  <span className="font-mono text-[9px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>{val}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Rebalance */}
        <Panel
          title="Rebalance from Current Book"
          subtitle="optional"
          bodyClassName="panel-body-sm"
          actions={
            <button onClick={() => setShowRebalance((v) => !v)} className="btn-terminal text-[9px] px-2 py-0.5">
              {showRebalance ? 'HIDE' : 'SHOW'}
            </button>
          }
        >
          <AnimatePresence>
            {showRebalance && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.12 }}
              >
                <p className="text-[9px] font-mono mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Enter current positions to receive delta trades needed.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {instruments.map((inst) => (
                    <div key={inst.symbol}>
                      <label className="tenor-label text-[9px] block mb-0.5">{inst.symbol}</label>
                      <input
                        type="text"
                        value={currentPositions[inst.symbol] ?? ''}
                        onChange={(e) =>
                          setCurrentPositions((prev) => ({
                            ...prev,
                            [inst.symbol]: e.target.value.replace(/[^\d-]/g, ''),
                          }))
                        }
                        placeholder="0"
                        className="input-terminal text-right"
                        style={{ fontSize: '11px' }}
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>

        {/* Optimize button */}
        <button
          onClick={handleOptimize}
          disabled={loading}
          className="w-full btn-primary py-3 flex items-center justify-center gap-2"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
          <span>{loading ? 'OPTIMIZING…' : 'OPTIMIZE HEDGE'}</span>
        </button>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="panel p-3 border border-red-500/30 flex gap-2 items-start"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span className="text-sm text-red-400 font-mono">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ══ RIGHT: Results ══════════════════════════════════════════════════════ */}
      <div className="xl:col-span-6 space-y-3">
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center py-20"
            >
              <div className="text-center space-y-3">
                <Calculator className="w-10 h-10 mx-auto" style={{ color: 'rgba(255,255,255,0.07)' }} />
                <p className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  Enter a target KRD vector and press Optimize
                </p>
                <p className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.12)' }}>
                  + value = long duration · − value = short duration
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              {/* ── Status + Unit toggle ── */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.within_tolerance ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  )}
                  <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {result.within_tolerance ? 'Within tolerance' : 'Residual exceeds tolerance'}
                  </span>
                  <span
                    className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-[2px]"
                    style={{
                      background: `${result.effectiveness.effectiveness_pct >= 90 ? '#00cc66' : result.effectiveness.effectiveness_pct >= 70 ? '#ff9900' : '#ff3333'}20`,
                      color: result.effectiveness.effectiveness_pct >= 90 ? '#00cc66' : result.effectiveness.effectiveness_pct >= 70 ? '#ff9900' : '#ff3333',
                    }}
                  >
                    {result.effectiveness.effectiveness_pct.toFixed(1)}% effective
                  </span>
                </div>
                <UnitToggle value={unit} onChange={setUnit} />
              </div>

              {/* ── KRD profile chart ── */}
              <Panel title="Key-Rate Profile" bodyClassName="p-2 overflow-x-auto">
                <div className="min-w-[420px]">
                  <KrdProfileChart
                    target={result.target_dv01}
                    achieved={result.achieved_dv01}
                    residual={result.residual}
                    unit={unit}
                    notional={refNotional}
                    width={520}
                    height={220}
                    activeTenor={activeTenor}
                    onTenorHover={setActiveTenor}
                  />
                </div>
              </Panel>

              {/* ── KRD breakdown table ── */}
              <Panel
                title="KRD Breakdown"
                actions={<span className="panel-subtitle">{DISPLAY_UNIT_LABELS[unit]}</span>}
              >
                <table className="table-terminal">
                  <thead>
                    <tr>
                      <th>Tenor</th>
                      <th>Target</th>
                      <th>Achieved</th>
                      <th>Residual</th>
                      <th>Cov%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KEY_RATE_TENORS.map((tenor) => {
                      const tgt = result.target_dv01[tenor] ?? 0
                      const ach = result.achieved_dv01[tenor] ?? 0
                      const res = result.residual[tenor] ?? 0
                      const covPct = tgt !== 0 ? Math.min(999, Math.round((ach / tgt) * 100)) : null
                      const isActive = activeTenor === tenor
                      const cv = (v: number) => convertUnit(v, unit, refNotional, tenor as KeyRateTenor)
                      return (
                        <tr
                          key={tenor}
                          onMouseEnter={() => setActiveTenor(tenor)}
                          onMouseLeave={() => setActiveTenor(null)}
                          style={{ background: isActive ? 'rgba(255,255,255,0.025)' : undefined }}
                        >
                          <td><span className="tenor-label">{tenor}</span></td>
                          <td style={{ color: '#00cccc' }}>{formatUnit(cv(tgt), unit)}</td>
                          <td style={{ color: '#ff9900' }}>{formatUnit(cv(ach), unit)}</td>
                          <td style={{ color: Math.abs(res) > 1000 ? '#ff9900' : 'rgba(255,255,255,0.3)' }}>
                            {formatUnit(cv(res), unit)}
                          </td>
                          <td>
                            {covPct !== null ? (
                              <span
                                className="font-semibold"
                                style={{ color: covPct >= 90 ? '#00cc66' : covPct >= 70 ? '#ff9900' : '#ff3333' }}
                              >
                                {covPct}%
                              </span>
                            ) : (
                              <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {/* Net residual summary pills */}
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-white/[0.06] flex-wrap">
                  <span className="stat-label mr-1">RESIDUAL:</span>
                  {KEY_RATE_TENORS.map((tenor) => {
                    const res = result.residual[tenor] ?? 0
                    if (Math.abs(res) < 0.5) return null
                    return (
                      <div
                        key={tenor}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-[2px]"
                        style={{
                          background: res > 0 ? 'rgba(255,153,0,0.1)' : 'rgba(255,51,51,0.1)',
                          border: `1px solid ${res > 0 ? 'rgba(255,153,0,0.25)' : 'rgba(255,51,51,0.25)'}`,
                        }}
                      >
                        <span className="font-mono text-[9px]" style={{ color: '#ffcc00' }}>{tenor}</span>
                        <span className="font-mono text-[9px] font-bold" style={{ color: res > 0 ? '#ff9900' : '#ff3333' }}>
                          {res > 0 ? '+' : ''}{Math.round(res)}
                        </span>
                      </div>
                    )
                  })}
                  {KEY_RATE_TENORS.every((t) => Math.abs(result.residual[t] ?? 0) < 0.5) && (
                    <span className="font-mono text-[9px] font-semibold" style={{ color: '#00cc66' }}>
                      ✓ Fully hedged
                    </span>
                  )}
                </div>
              </Panel>

              {/* ── Contract positions ── */}
              <SectionBlock title="Recommended Positions" id="positions" expanded={expandedSections.has('positions')} onToggle={toggleSection}>
                <table className="table-terminal w-full mb-3">
                  <thead>
                    <tr>
                      <th>Instrument</th>
                      <th className="text-right">Contracts</th>
                      <th className="text-right">Notional</th>
                      <th className="text-right">DV01/ct</th>
                      <th className="text-right">Total DV01</th>
                      <th className="text-right">Margin/ct</th>
                      <th className="text-right">Total Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.contracts_detail.map((c) => (
                      <tr key={c.symbol}>
                        <td>
                          <span className="tenor-label mr-1.5">{c.symbol}</span>
                          <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{c.name}</span>
                        </td>
                        <td className="text-right">
                          <span className="font-mono font-bold text-xs" style={{ color: c.contracts > 0 ? '#00cc66' : '#ff3333' }}>
                            {c.contracts > 0 ? '+' : ''}{c.contracts}
                          </span>
                          <span className="font-mono text-[9px] ml-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
                            {c.direction}
                          </span>
                        </td>
                        <td className="text-right font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                          {fmtNotional(c.notional_face ?? 0)}
                        </td>
                        <td className="text-right font-mono text-[10px]" style={{ color: '#ff9900' }}>
                          ${c.dv01_per_contract}
                        </td>
                        <td className="text-right font-mono text-[10px]" style={{ color: '#ff9900' }}>
                          {fmt$(c.total_dv01)}
                        </td>
                        <td className="text-right font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          ${(c.margin_per_contract ?? 0).toLocaleString()}
                        </td>
                        <td className="text-right font-mono text-[10px] font-semibold" style={{ color: '#00cccc' }}>
                          {fmt$(c.total_margin ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      <td colSpan={2} className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        TOTALS
                      </td>
                      <td className="text-right font-mono text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {fmtNotional(result.contracts_detail.reduce((s, c) => s + (c.notional_face ?? 0), 0))}
                      </td>
                      <td />
                      <td className="text-right font-mono text-[10px] font-bold" style={{ color: '#ff9900' }}>
                        {fmt$(result.gross_dv01)}
                      </td>
                      <td />
                      <td className="text-right font-mono text-[10px] font-bold" style={{ color: '#00cccc' }}>
                        {fmt$(result.margin_estimate)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                <p className="font-mono text-[9px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  Margin estimates are approximate CME initial margin (SPAN-based; subject to daily change).
                  Notional = |contracts| × face value per contract.
                </p>
              </SectionBlock>

              {/* ── Rebalancing ── */}
              {result.rebalance && (
                <SectionBlock title="Rebalance Delta" id="rebalance" expanded={expandedSections.has('rebalance')} onToggle={toggleSection}>
                  <div className="space-y-1">
                    {Object.entries(result.rebalance.delta).map(([inst, delta]) => (
                      <div key={inst} className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0">
                        <span className="tenor-label">{inst}</span>
                        <div className="text-right">
                          <span className="font-mono font-bold text-sm" style={{ color: delta > 0 ? '#00cc66' : '#ff3333' }}>
                            {delta > 0 ? '+' : ''}{delta}
                          </span>
                          <span className="font-mono text-[9px] ml-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {delta > 0 ? 'BUY' : 'SELL'}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 flex items-center justify-between">
                      <span className="stat-label">TURNOVER</span>
                      <span className="font-mono font-bold text-sm text-yellow-400">{result.rebalance.turnover_contracts} contracts</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="stat-label">MARGIN (DELTA)</span>
                      <span className="font-mono font-bold text-sm" style={{ color: '#00cccc' }}>
                        {fmt$(result.rebalance.turnover_margin_estimate)}
                      </span>
                    </div>
                  </div>
                </SectionBlock>
              )}

              {/* ── Scenario P&L ── */}
              {result.scenarios.length > 0 && (
                <SectionBlock title="Scenario P&L" subtitle="pre-hedge | hedge | net" id="scenarios" expanded={expandedSections.has('scenarios')} onToggle={toggleSection}>
                  <ScenarioPanel scenarios={result.scenarios} />
                </SectionBlock>
              )}

              {/* ── Factor + Effectiveness ── */}
              <SectionBlock title="Risk Analytics" id="analysis" expanded={expandedSections.has('analysis')} onToggle={toggleSection}>
                <div className="space-y-3">
                  <div>
                    <div className="stat-label mb-2">FACTOR EXPOSURES</div>
                    <table className="table-terminal">
                      <thead>
                        <tr>
                          <th>Factor</th>
                          <th>Target</th>
                          <th>Hedge</th>
                          <th>Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(['level', 'slope', 'curvature'] as const).map((f) => (
                          <tr key={f}>
                            <td className="uppercase text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{f}</td>
                            <td style={{ color: '#00cccc' }}>{fmt$(result.factor_target[f])}</td>
                            <td style={{ color: '#ff9900' }}>{fmt$(result.factor_hedge[f])}</td>
                            <td style={{ color: signColor(result.factor_net[f]) }}>{fmt$(result.factor_net[f])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
                    <div>
                      <div className="stat-label">EFFECTIVENESS</div>
                      <div className="stat-value mt-0.5" style={{ color: result.effectiveness.effectiveness_pct >= 90 ? '#00cc66' : result.effectiveness.effectiveness_pct >= 70 ? '#ff9900' : '#ff3333' }}>
                        {result.effectiveness.effectiveness_pct.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="stat-label">DV01 REDUCTION</div>
                      <div className="stat-value mt-0.5">{fmt$(result.effectiveness.dv01_reduction)}</div>
                    </div>
                    <div>
                      <div className="stat-label">TARGET |DV01|</div>
                      <div className="font-mono text-sm font-semibold mt-0.5" style={{ color: '#00cccc' }}>
                        {fmt$(result.effectiveness.target_abs_dv01)}
                      </div>
                    </div>
                    <div>
                      <div className="stat-label">RESIDUAL |DV01|</div>
                      <div className="font-mono text-sm font-semibold mt-0.5" style={{ color: result.effectiveness.residual_abs_dv01 > 5000 ? '#ff9900' : '#00cc66' }}>
                        {fmt$(result.effectiveness.residual_abs_dv01)}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="stat-label">RESIDUAL RATIO</span>
                      <span className="font-mono font-bold text-xs" style={{ color: result.residual_ratio < 0.1 ? '#00cc66' : '#ff9900' }}>
                        {(result.residual_ratio * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, result.residual_ratio * 100)}%`,
                          background: result.residual_ratio < 0.1 ? '#00cc66' : result.residual_ratio < 0.25 ? '#ff9900' : '#ff3333',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </SectionBlock>

              {/* ── Warnings ── */}
              {result.warnings.length > 0 && (
                <div className="panel p-3 border border-yellow-500/20 bg-yellow-500/[0.03]">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="label-orange text-yellow-400">MODEL WARNINGS</span>
                  </div>
                  {result.warnings.map((w) => (
                    <div key={w} className="font-mono text-xs mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{w}</div>
                  ))}
                </div>
              )}

              {/* ── Assumptions ── */}
              <div className="panel p-3 bg-white/[0.01]">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Info className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
                  <span className="stat-label">MODEL ASSUMPTIONS</span>
                </div>
                {result.assumptions.map((a) => (
                  <div key={a} className="font-mono text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.22)' }}>{a}</div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Collapsible section ────────────────────────────────────────────────────────

function SectionBlock({
  title, subtitle, id, expanded, onToggle, children,
}: {
  title: string
  subtitle?: string
  id: string
  expanded: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="panel">
      <button onClick={() => onToggle(id)} className="panel-header w-full text-left">
        <div className="flex items-center gap-2">
          {expanded
            ? <ChevronDown className="w-3 h-3 text-bloomberg-orange" />
            : <ChevronRight className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
          }
          <span className="panel-title">{title}</span>
          {subtitle && <span className="panel-subtitle">{subtitle}</span>}
        </div>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.13 }}
            className="overflow-hidden"
          >
            <div className="panel-body">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
