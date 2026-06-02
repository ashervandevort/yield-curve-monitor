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
  ExportPdfButton,
  ChartContainer,
  SpreadTimeSeriesChart,
  spreadColor,
  MacroCalendar,
  CurveWriteUpPanel,
  YieldContextPanel,
  FuturesCurveHelp,
} from '@/components'
import { ShareLinks } from '@/components/ShareButton'
import {
  CurveType,
  SpreadsData,
  CurveChartData,
  OverlayCurve,
  YieldCurve,
  HedgeResult,
  TENOR_ORDER,
  FUTURES_CONTRACTS,
  FUTURES_CONTRACT_ORDER,
  SpreadHistoryPoint,
  tenorToYears,
  CURVE_COLORS,
} from '@/types'

type SpreadsWithRegime = SpreadsData & {
  regime?: { level: number; slope: number; curvature: number; label: string }
}

type TabId = 'monitor' | 'hedge' | 'macro'

/** Page auto-refresh — hits our API (SQLite cache), not FRED on every tick */
const AUTO_REFRESH_MS = 5 * 60 * 1000
const AUTO_REFRESH_MINUTES = AUTO_REFRESH_MS / 60_000

const SPREAD_LABELS: Record<string, string> = {
  '2s10s': '2s10s',
  '3m10y': '3m10y',
  '5s30s': '5s30s',
  '2s30s': '2s30s',
  '2s5s': '2s5s',
  '5s10s30s': '5s10s30s',
  '2s5s10s': '2s5s10s',
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
  const [activeTab, setActiveTab]               = useState<TabId>('monitor')
  const [activeTenor, setActiveTenor]           = useState<string | null>(null)
  const [selectedSpreads, setSelectedSpreads]   = useState<string[]>([])
  const [spreadHistory, setSpreadHistory]       = useState<Record<string, SpreadHistoryPoint[]>>({})

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

  const chartColumnLabels = useMemo(() => {
    if (curveType === 'futures') return [...FUTURES_CONTRACT_ORDER]
    if (!latestCurve) return [...TENOR_ORDER]
    return TENOR_ORDER.filter((t) => latestCurve.yields[t] !== undefined)
  }, [curveType, latestCurve])

  useEffect(() => {
    setActiveTenor(null)
  }, [curveType, selectedSpreads.length])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const id = setInterval(fetchData, AUTO_REFRESH_MS)
    return () => clearInterval(id)
  }, [fetchData])

  useEffect(() => {
    if (selectedSpreads.length === 0) {
      setSpreadHistory({})
      return
    }
    const q = selectedSpreads.join(',')
    fetch(`/api/curve/spreads/history?spreads=${encodeURIComponent(q)}&days=365`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) setSpreadHistory(d.data)
      })
      .catch(() => setSpreadHistory({}))
  }, [selectedSpreads])

  const handleSpreadToggle = useCallback((key: string) => {
    setSelectedSpreads((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key)
      if (prev.length >= 3) return [...prev.slice(1), key]
      return [...prev, key]
    })
  }, [])

  const chartData: CurveChartData[] = useMemo(() => {
    if (!latestCurve) return []
    if (curveType === 'futures') {
      return FUTURES_CONTRACTS.filter((c) => latestCurve.yields[c.tenor] !== undefined).map(
        (c) => ({
          tenor: c.symbol,
          tenorNumeric: tenorToYears[c.tenor],
          yield: latestCurve.yields[c.tenor],
          label: c.symbol,
        }),
      )
    }
    return TENOR_ORDER.filter((t) => latestCurve.yields[t] !== undefined).map((t) => ({
      tenor: t,
      tenorNumeric: tenorToYears[t],
      yield: latestCurve.yields[t],
      label: t,
    }))
  }, [latestCurve, curveType])

  const overlayData: OverlayCurve[] = useMemo(() => {
    if (!latestCurve || !changesData || selectedSpreads.length > 0) return []
    const keys =
      curveType === 'futures'
        ? FUTURES_CONTRACTS.map((c) => ({ label: c.symbol, tenor: c.tenor }))
        : TENOR_ORDER.map((t) => ({ label: t, tenor: t }))
    return selectedOverlays
      .filter((id) => changesData[id])
      .map((id) => {
        const wd = changesData[id]
        return {
          id,
          label: `${id} ago`,
          color: CURVE_COLORS[id as keyof typeof CURVE_COLORS] || '#888',
          data: keys
            .filter(({ tenor }) => latestCurve.yields[tenor] !== undefined && wd.changes[tenor] !== undefined)
            .map(({ label, tenor }) => ({
              tenor: label,
              tenorNumeric: tenorToYears[tenor],
              yield: latestCurve.yields[tenor] - wd.changes[tenor] / 100,
              label,
            })),
        }
      })
  }, [latestCurve, changesData, selectedOverlays, curveType, selectedSpreads.length])

  const spreadChartSeries = useMemo(
    () =>
      selectedSpreads
        .filter((k) => spreadHistory[k]?.length)
        .map((k) => ({
          key: k,
          label: SPREAD_LABELS[k] ?? k,
          color: spreadColor(k),
          data: spreadHistory[k],
        })),
    [selectedSpreads, spreadHistory],
  )

  const pdfPayload = useMemo(() => {
    if (!latestCurve || !spreadsData || !changesData) return null
    return { curve: latestCurve, spreads: spreadsData, changes: changesData, curveType }
  }, [latestCurve, spreadsData, changesData, curveType])

  const chartTitle =
    selectedSpreads.length > 0
      ? `Spread History · ${selectedSpreads.join(', ')}`
      : curveType === 'futures'
        ? 'Treasury Futures Curve (CTD yields)'
        : 'Treasury Yield Curve'

  const tabs: { id: TabId; label: string }[] = [
    { id: 'monitor', label: 'Curve Monitor' },
    { id: 'hedge', label: 'Hedge Optimizer' },
    { id: 'macro', label: 'Macro Calendar' },
  ]

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ background: '#07090c' }}>
      <StatusBar
        curveDate={latestCurve?.date ?? null}
        lastFetched={lastUpdated}
        loading={loading}
        onRefresh={fetchData}
        backendStatus={backendStatus}
        curveMetadata={latestCurve?.metadata ?? null}
        autoRefreshMinutes={AUTO_REFRESH_MINUTES}
      />

      <div className="flex-1 p-2 sm:p-3 min-h-0">
        <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div
            className="flex items-center justify-center gap-0.5 p-0.5 rounded-[2px] w-full sm:w-auto flex-wrap"
            style={{ background: '#0f1318', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-2 sm:px-4 py-2 font-mono text-[10px] sm:text-xs font-semibold rounded-[1px] uppercase tracking-wider transition-all"
                style={{
                  background: activeTab === tab.id ? '#ff6600' : 'transparent',
                  color: activeTab === tab.id ? '#000' : 'rgba(255,255,255,0.4)',
                  letterSpacing: '0.07em',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {activeTab === 'monitor' && (
            <div className="flex flex-col items-center gap-2 w-full sm:w-auto">
              <CurveToggle value={curveType} onChange={setCurveType} />
              {curveType === 'futures' && (
                <div className="w-full max-w-4xl">
                  <FuturesCurveHelp />
                </div>
              )}
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'monitor' && (
            <motion.div
              key="monitor"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
            >
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
                <div className="xl:col-span-8 space-y-3 min-w-0">
                  <div className="panel">
                    <div className="panel-header flex-col sm:flex-row items-center gap-2">
                      <span className="panel-title">{chartTitle}</span>
                      <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto justify-center sm:justify-end">
                        {selectedSpreads.length === 0 && (
                          <OverlaySelector selected={selectedOverlays} onChange={setSelectedOverlays} />
                        )}
                        {selectedSpreads.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedSpreads([])}
                            className="px-2 py-1 btn-terminal text-[10px] font-mono"
                          >
                            CLEAR SPREADS
                          </button>
                        )}
                        <ExportPdfButton payload={pdfPayload} disabled={loading} />
                      </div>
                    </div>
                    <div className="p-2 w-full">
                      {loading && chartData.length === 0 && selectedSpreads.length === 0 ? (
                        <div className="h-64 flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-white/10 border-t-bloomberg-orange rounded-full animate-spin" />
                        </div>
                      ) : (
                        <ChartContainer>
                          {(width) =>
                            selectedSpreads.length > 0 ? (
                              <SpreadTimeSeriesChart series={spreadChartSeries} width={width} height={300} />
                            ) : (
                              <YieldCurveChart
                                todayCurve={chartData}
                                overlays={overlayData}
                                width={width}
                                height={300}
                                curveType={curveType}
                                xDomain={chartColumnLabels}
                                animate
                                activeTenor={activeTenor}
                                onTenorChange={setActiveTenor}
                              />
                            )
                          }
                        </ChartContainer>
                      )}
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-header">
                      <span className="panel-title">Yield Changes (bp)</span>
                      <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {latestCurve?.date ?? '—'}
                      </span>
                    </div>
                    <div className="p-2 w-full">
                      {changesData ? (
                        <ChartContainer>
                          {(width) => (
                            <ChangeHeatmap
                              data={changesData}
                              curveType={curveType}
                              width={width}
                              height={165}
                              columnLabels={chartColumnLabels}
                              activeTenor={activeTenor}
                              onTenorChange={setActiveTenor}
                            />
                          )}
                        </ChartContainer>
                      ) : (
                        <div className="h-36 flex items-center justify-center">
                          <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                            Loading…
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="panel">
                      <div className="panel-header">
                        <span className="panel-title">Snapshot</span>
                      </div>
                      <div className="panel-body-sm">
                        {latestCurve ? (
                          <div>
                            {(curveType === 'futures'
                              ? FUTURES_CONTRACTS
                              : [
                                  { symbol: '2Y', tenor: '2Y' },
                                  { symbol: '5Y', tenor: '5Y' },
                                  { symbol: '10Y', tenor: '10Y' },
                                  { symbol: '20Y', tenor: '20Y' },
                                  { symbol: '30Y', tenor: '30Y' },
                                ]
                            ).map(({ symbol, tenor }) => (
                              <div key={symbol} className="stat-row">
                                <span className="tenor-label text-[10px]">{symbol}</span>
                                <span className="font-mono font-semibold text-sm" style={{ color: '#00cccc' }}>
                                  {latestCurve.yields[tenor]?.toFixed(3) ?? '—'}%
                                </span>
                              </div>
                            ))}
                            <div className="divider-h my-2" />
                            <div className="stat-row">
                              <span className="stat-label">DATA DATE</span>
                              <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.85)' }}>
                                {latestCurve.date}
                              </span>
                            </div>
                            <div className="stat-row">
                              <span className="stat-label">SOURCE</span>
                              <span className="font-mono text-xs" style={{ color: '#00cccc' }}>
                                {latestCurve.metadata?.source ?? 'FRED'} · daily close
                              </span>
                            </div>
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

                    <div className="panel">
                      <div className="panel-header">
                        <span className="panel-title">Market Write-Up</span>
                      </div>
                      <div className="panel-body-sm">
                        <CurveWriteUpPanel
                          curve={latestCurve}
                          spreads={spreadsData}
                          changes={changesData}
                          curveType={curveType}
                          loading={loading && !latestCurve}
                        />
                      </div>
                    </div>
                  </div>

                  <YieldContextPanel curve={latestCurve} loading={loading && !latestCurve} />
                </div>

                <div className="xl:col-span-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3 content-start">
                  <div className="panel sm:col-span-1">
                    <div className="panel-header">
                      <span className="panel-title">Key Spreads</span>
                      {spreadsData?.date && <span className="panel-subtitle">{spreadsData.date}</span>}
                    </div>
                    <div className="panel-body-sm">
                      <SpreadsPanel
                        data={spreadsData}
                        loading={loading && !spreadsData}
                        selectedSpreads={selectedSpreads}
                        onSpreadToggle={handleSpreadToggle}
                      />
                    </div>
                  </div>

                  <div className="panel sm:col-span-1">
                    <div className="panel-header">
                      <span className="panel-title">Curve Regime</span>
                    </div>
                    <div className="panel-body-sm">
                      <CurveRegime regime={spreadsData?.regime ?? null} loading={loading && !spreadsData} />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'hedge' && (
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

          {activeTab === 'macro' && (
            <motion.div
              key="macro"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <MacroCalendar days={45} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer
        className="px-4 py-2.5 flex flex-col sm:flex-row flex-wrap items-center justify-center sm:justify-between gap-2 font-mono text-[9px] text-center sm:text-left"
        style={{ background: '#0f1318', borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}
      >
        <span>Data: FRED daily closes · Treasury constant maturity</span>
        <span>DV01 values are approximations · Not financial advice</span>
        <ShareLinks />
        <span>
          Provided by{' '}
          <a
            href="https://252.capital"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-[#ff6600] transition-colors"
            style={{ color: 'rgba(255,102,0,0.9)' }}
          >
            252.capital
          </a>
        </span>
      </footer>
    </div>
  )
}
