'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  YieldCurveChart,
  ChangeHeatmap,
  SpreadsPanel,
  HedgeOptimizer,
  CurveToggle,
  OverlaySelector,
  StatusBar,
  CurveRegime,
} from '@/components'
import {
  CurveType,
  SpreadsData,
  CurveChartData,
  OverlayCurve,
  YieldCurve,
  TENOR_ORDER,
  FUTURES_TENOR_ORDER,
  tenorToYears,
  CURVE_COLORS,
} from '@/types'

type SpreadsWithRegime = SpreadsData & {
  regime?: { level: number; slope: number; curvature: number; label: string }
}

export default function Home() {
  const [curveType, setCurveType]               = useState<CurveType>('full')
  const [selectedOverlays, setSelectedOverlays] = useState<string[]>(['1W'])
  const [loading, setLoading]                   = useState(true)
  const [lastUpdated, setLastUpdated]           = useState<Date | null>(null)
  const [backendStatus, setBackendStatus]       = useState<'connected' | 'disconnected' | 'checking'>('checking')
  const [latestCurve, setLatestCurve]           = useState<YieldCurve | null>(null)
  const [changesData, setChangesData]           = useState<Record<string, { from_date: string; to_date: string; changes: Record<string, number> }> | null>(null)
  const [spreadsData, setSpreadsData]           = useState<SpreadsWithRegime | null>(null)
  const [activeTab, setActiveTab]               = useState<'monitor' | 'hedge'>('monitor')
  const [activeTenor, setActiveTenor]           = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setBackendStatus('checking')
    try {
      const [curveRes, changesRes, spreadsRes] = await Promise.all([
        fetch(`/api/curve/latest?curve_type=${curveType}`),
        fetch(`/api/curve/changes?curve_type=${curveType}`),
        fetch('/api/curve/spreads'),
      ])

      setBackendStatus(curveRes.ok ? 'connected' : 'disconnected')

      if (curveRes.ok) {
        const d = await curveRes.json()
        if (d.success && d.data) setLatestCurve(d.data)
      }
      if (changesRes.ok) {
        const d = await changesRes.json()
        if (d.success && d.data) setChangesData(d.data)
      }
      if (spreadsRes.ok) {
        const d = await spreadsRes.json()
        if (d.success) setSpreadsData(d)
      }
      setLastUpdated(new Date())
    } catch {
      setBackendStatus('disconnected')
    } finally {
      setLoading(false)
    }
  }, [curveType])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [curveType])
  useEffect(() => {
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [fetchData])

  const chartData: CurveChartData[] = useMemo(() => {
    if (!latestCurve) return []
    const tenors = curveType === 'futures' ? FUTURES_TENOR_ORDER : TENOR_ORDER
    return tenors
      .filter((t) => latestCurve.yields[t] !== undefined)
      .map((t) => ({
        tenor: t,
        tenorNumeric: tenorToYears[t],
        yield: latestCurve.yields[t],
        label: t,
      }))
  }, [latestCurve, curveType])

  const overlayData: OverlayCurve[] = useMemo(() => {
    if (!latestCurve || !changesData) return []
    const tenors = curveType === 'futures' ? FUTURES_TENOR_ORDER : TENOR_ORDER
    return selectedOverlays
      .filter((id) => changesData[id])
      .map((id) => {
        const wd = changesData[id]
        return {
          id,
          label: `${id} ago`,
          color: CURVE_COLORS[id as keyof typeof CURVE_COLORS] || '#888',
          data: tenors
            .filter((t) => latestCurve.yields[t] !== undefined && wd.changes[t] !== undefined)
            .map((t) => ({
              tenor: t,
              tenorNumeric: tenorToYears[t],
              yield: latestCurve.yields[t] - wd.changes[t] / 100,
              label: t,
            })),
        }
      })
  }, [latestCurve, changesData, selectedOverlays, curveType])

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ background: '#07090c' }}>
      {/* ── Status bar ── */}
      <StatusBar
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={fetchData}
        backendStatus={backendStatus}
        curveMetadata={latestCurve?.metadata ?? null}
      />

      {/* ── Main content ── */}
      <div className="flex-1 p-2 sm:p-3 min-h-0">

        {/* Tab nav + curve toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-[2px]"
            style={{ background: '#0f1318', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {(['monitor', 'hedge'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-3 sm:px-5 py-2 font-mono text-[10px] sm:text-xs font-semibold rounded-[1px] uppercase tracking-wider transition-all"
                style={{
                  background: activeTab === tab ? '#ff6600' : 'transparent',
                  color: activeTab === tab ? '#000' : 'rgba(255,255,255,0.4)',
                  letterSpacing: '0.07em',
                }}
              >
                {tab === 'monitor' ? 'Curve Monitor' : 'Hedge Optimizer'}
              </button>
            ))}
          </div>
          <CurveToggle value={curveType} onChange={setCurveType} />
        </div>

        {/* ── Tab content ── */}
        <AnimatePresence mode="wait">
          {activeTab === 'monitor' ? (
            <motion.div
              key="monitor"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
            >
              {/* Responsive: stacks vertically below xl, side-by-side at xl+ */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">

                {/* ── Chart + heatmap (xl: 8-col) ── */}
                <div className="xl:col-span-8 space-y-3 min-w-0">

                  {/* Yield curve */}
                  <div className="panel">
                    <div className="panel-header">
                      <span className="panel-title">Treasury Yield Curve</span>
                      <OverlaySelector selected={selectedOverlays} onChange={setSelectedOverlays} />
                    </div>
                    <div className="p-2 overflow-x-auto">
                      {loading && chartData.length === 0 ? (
                        <div className="h-64 flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-white/10 border-t-bloomberg-orange rounded-full animate-spin" />
                        </div>
                      ) : (
                        <div className="min-w-[480px]">
                          <YieldCurveChart
                            todayCurve={chartData}
                            overlays={overlayData}
                            width={760}
                            height={300}
                            curveType={curveType}
                            animate
                            activeTenor={activeTenor}
                            onTenorChange={setActiveTenor}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Change heatmap */}
                  <div className="panel">
                    <div className="panel-header">
                      <span className="panel-title">Yield Changes (bp)</span>
                      <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {latestCurve?.date ?? '—'}
                      </span>
                    </div>
                    <div className="p-2 overflow-x-auto">
                      {changesData ? (
                        <div className="min-w-[480px]">
                          <ChangeHeatmap
                            data={changesData}
                            curveType={curveType}
                            width={740}
                            height={165}
                            activeTenor={activeTenor}
                            onTenorChange={setActiveTenor}
                          />
                        </div>
                      ) : (
                        <div className="h-36 flex items-center justify-center">
                          <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                            Loading…
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Sidebar (xl: 4-col, otherwise full-width row below) ── */}
                <div className="xl:col-span-4 grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-3 content-start">

                  {/* Key spreads */}
                  <div className="panel sm:col-span-1">
                    <div className="panel-header">
                      <span className="panel-title">Key Spreads</span>
                    </div>
                    <div className="panel-body-sm">
                      <SpreadsPanel data={spreadsData} loading={loading && !spreadsData} />
                    </div>
                  </div>

                  {/* Curve regime */}
                  <div className="panel sm:col-span-1">
                    <div className="panel-header">
                      <span className="panel-title">Curve Regime</span>
                    </div>
                    <div className="panel-body-sm">
                      <CurveRegime
                        regime={spreadsData?.regime ?? null}
                        loading={loading && !spreadsData}
                      />
                    </div>
                  </div>

                  {/* Snapshot */}
                  <div className="panel sm:col-span-1">
                    <div className="panel-header">
                      <span className="panel-title">Snapshot</span>
                    </div>
                    <div className="panel-body-sm">
                      {latestCurve ? (
                        <div>
                          {[
                            { label: '2Y', key: '2Y' },
                            { label: '5Y', key: '5Y' },
                            { label: '10Y', key: '10Y' },
                            { label: '20Y', key: '20Y' },
                            { label: '30Y', key: '30Y' },
                          ].map(({ label, key }) => (
                            <div key={key} className="stat-row">
                              <span className="tenor-label text-[10px]">{label}</span>
                              <span className="font-mono font-semibold text-sm" style={{ color: '#00cccc' }}>
                                {latestCurve.yields[key]?.toFixed(3) ?? '—'}%
                              </span>
                            </div>
                          ))}
                          <div className="divider-h my-2" />
                          <div className="stat-row">
                            <span className="stat-label">DATA DATE</span>
                            <span className="font-mono text-xs text-yellow-400">{latestCurve.date}</span>
                          </div>
                          <div className="stat-row">
                            <span className="stat-label">SOURCE</span>
                            <span className="font-mono text-xs" style={{ color: '#00cccc' }}>
                              {latestCurve.metadata?.source ?? 'FRED'}
                            </span>
                          </div>
                          <div className="stat-row">
                            <span className="stat-label">CACHE</span>
                            <span
                              className="font-mono text-xs font-semibold"
                              style={{
                                color: latestCurve.metadata?.stale || latestCurve.metadata?.is_partial
                                  ? '#ff9900'
                                  : '#00cc66',
                              }}
                            >
                              {(latestCurve.metadata?.cache_status ?? 'live').toUpperCase()}
                            </span>
                          </div>
                          {(latestCurve.metadata?.stale || latestCurve.metadata?.is_partial) && (
                            <div className="mt-2 p-2 rounded-[2px] border border-yellow-500/25 bg-yellow-500/[0.04]">
                              <span className="font-mono text-[9px] text-yellow-400">
                                {latestCurve.metadata?.stale
                                  ? 'STALE — FRED UNAVAILABLE'
                                  : 'PARTIAL CURVE'}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="skeleton h-5 rounded" />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="hedge"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
            >
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">DV01 Hedge Optimizer</span>
                  <span className="panel-subtitle">7-POINT KEY-RATE GRID · ZT ZF ZN TN ZB UB</span>
                </div>
                <div className="panel-body">
                  <HedgeOptimizer />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer ── */}
      <div
        className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[9px]"
        style={{ background: '#0f1318', borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.2)' }}
      >
        <span>Data: FRED (Federal Reserve Economic Data)</span>
        <span>DV01 values are approximations · Not financial advice</span>
        <span>Frontend :3053 · Backend :8053</span>
      </div>
    </div>
  )
}
