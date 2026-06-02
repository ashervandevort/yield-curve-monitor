'use client'

import { useEffect, useState, useMemo } from 'react'
import { MacroRelease, MarketDay } from '@/types'
import { FileDown, Copy, Check } from 'lucide-react'
import {
  buildMacroCalendarText,
  exportMacroCalendarPdf,
  filterMacroExportPayload,
  MacroExportPayload,
} from '@/lib/exportMacroCalendar'
import { MACRO_CATEGORY_COLOR, MACRO_MARKET_STYLE } from '@/lib/macroCalendarStyles'

interface MacroCalendarProps {
  days?: number
}

const VIEW_PAST_DAYS = 30
const VIEW_FUTURE_DAYS = 60

const CATEGORY_COLOR = MACRO_CATEGORY_COLOR

const MARKET_STYLE = MACRO_MARKET_STYLE

interface CalendarEvent extends MacroRelease {
  release_key?: string
}

function filterByWindow(releases: MacroRelease[], pastDays: number, futureDays: number): MacroRelease[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - pastDays)
  const end = new Date(today)
  end.setDate(end.getDate() + futureDays)
  return releases.filter((r) => {
    const d = new Date(r.date + 'T12:00:00')
    return d >= start && d <= end
  })
}

function toDisplayEvents(events: CalendarEvent[] | undefined): MacroRelease[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return (events ?? []).map((e) => {
    const d = new Date(e.date + 'T12:00:00')
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
    const dayOfWeek =
      e.day_of_week ??
      d.toLocaleDateString('en-US', { weekday: 'short' })
    return {
      release_id: e.release_id ?? 0,
      name: e.name,
      category: e.category,
      date: e.date,
      days_from_today: diff,
      day_of_week: dayOfWeek,
      release_time_et: e.release_time_et,
      release_time_label: e.release_time_label,
      source: e.source,
    }
  })
}

function groupByMonth(releases: MacroRelease[]): Map<string, MacroRelease[]> {
  const map = new Map<string, MacroRelease[]>()
  for (const r of releases) {
    const d = new Date(r.date + 'T12:00:00')
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.date.localeCompare(b.date))
  }
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function CalendarLegend() {
  return (
    <div
      className="panel panel-body-sm flex flex-wrap gap-x-4 gap-y-2 items-center justify-center"
      style={{ background: 'rgba(255,255,255,0.02)' }}
    >
      <span className="font-mono text-[8px] w-full text-center sm:w-auto sm:text-left" style={{ color: 'rgba(255,255,255,0.35)' }}>
        Legend
      </span>
      {Object.entries(CATEGORY_COLOR).map(([cat, color]) => (
        <div key={cat} className="flex items-center gap-1.5 font-mono text-[8px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          {cat.replace('_', ' ')}
        </div>
      ))}
      <div className="hidden sm:block w-px h-4 bg-white/10" />
      {(['closed', 'early_close', 'weekend'] as const).map((type) => (
        <div key={type} className="flex items-center gap-1.5 font-mono text-[8px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
          <span
            className="w-3 h-3 rounded-[2px] border"
            style={{
              background: MARKET_STYLE[type].bg,
              borderColor: MARKET_STYLE[type].border,
            }}
          />
          {MARKET_STYLE[type].label}
        </div>
      ))}
    </div>
  )
}

function MonthGrid({
  monthKey,
  events,
  marketByDate,
  today,
}: {
  monthKey: string
  events: MacroRelease[]
  marketByDate: Record<string, MarketDay>
  today: string
}) {
  const [y, m] = monthKey.split('-').map(Number)
  const firstDay = new Date(y, m - 1, 1)
  const daysInMonth = new Date(y, m, 0).getDate()
  const startPad = firstDay.getDay()
  const byDate = useMemo(() => {
    const map = new Map<string, MacroRelease[]>()
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date)!.push(e)
    }
    return map
  }, [events])

  const label = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const cells: (number | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">{label}</span>
        <span className="panel-subtitle">{events.length} releases</span>
      </div>
      <div className="panel-body-sm">
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div
              key={`${d}-${i}`}
              className="text-center font-mono text-[8px] py-0.5"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`pad-${idx}`} className="aspect-square" />
            const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayEvents = byDate.get(iso) ?? []
            const market = marketByDate[iso]
            const isToday = iso === today
            const isPast = iso < today
            const marketStyle = market ? MARKET_STYLE[market.day_type] : null

            let background = isToday ? 'rgba(255,102,0,0.12)' : 'rgba(255,255,255,0.02)'
            let borderColor = isToday ? 'rgba(255,102,0,0.35)' : 'rgba(255,255,255,0.04)'
            if (marketStyle && !isToday) {
              background = marketStyle.bg
              borderColor = marketStyle.border
            }

            const titleParts = [
              market?.name,
              market?.day_type === 'early_close' ? 'Early close 2:00 PM ET' : null,
              ...dayEvents.map((e) => `${e.name} (${e.release_time_label ?? 'ET'})`),
            ].filter(Boolean)

            return (
              <div
                key={iso}
                className="aspect-square rounded-[2px] flex flex-col items-center justify-between py-0.5 px-0.5 border"
                style={{
                  background,
                  borderColor,
                  opacity: isPast && !isToday && market?.day_type !== 'closed' ? 0.55 : 1,
                }}
                title={titleParts.join(' · ')}
              >
                <span
                  className="font-mono text-[8px] leading-none"
                  style={{
                    color: isToday
                      ? '#ff6600'
                      : market?.day_type === 'closed'
                        ? 'rgba(255,120,120,0.85)'
                        : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {day}
                </span>
                {market?.day_type === 'early_close' && dayEvents.length === 0 && (
                  <span className="font-mono text-[6px] leading-none mt-0.5" style={{ color: 'rgba(255,153,0,0.8)' }}>
                    2p
                  </span>
                )}
                <div className="flex flex-wrap gap-1 justify-center items-end mt-auto pb-0.5 min-h-[14px]">
                  {dayEvents.slice(0, 4).map((e) => (
                    <span
                      key={`${e.release_id}-${e.name}`}
                      className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/20"
                      style={{ background: CATEGORY_COLOR[e.category] ?? '#888' }}
                    />
                  ))}
                  {dayEvents.length > 4 && (
                    <span className="font-mono text-[6px] leading-none" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      +{dayEvents.length - 4}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function MacroCalendar({ days = 45 }: MacroCalendarProps) {
  const [releases, setReleases] = useState<MacroRelease[]>([])
  const [marketDaysList, setMarketDaysList] = useState<MarketDay[]>([])
  const [marketByDate, setMarketByDate] = useState<Record<string, MarketDay>>({})
  const [storageMeta, setStorageMeta] = useState<{ status?: string; rows?: number; syncAge?: number }>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const exportPayload: MacroExportPayload | null = useMemo(() => {
    if (!releases.length && !marketDaysList.length) return null
    return filterMacroExportPayload({
      days,
      releases,
      marketDays: marketDaysList,
    })
  }, [days, releases, marketDaysList])

  const viewReleases = useMemo(
    () => filterByWindow(releases, VIEW_PAST_DAYS, VIEW_FUTURE_DAYS),
    [releases],
  )

  const viewMarketByDate = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(today)
    start.setDate(start.getDate() - VIEW_PAST_DAYS)
    const end = new Date(today)
    end.setDate(end.getDate() + VIEW_FUTURE_DAYS)
    const out: Record<string, MarketDay> = {}
    for (const [iso, day] of Object.entries(marketByDate)) {
      const d = new Date(iso + 'T12:00:00')
      if (d >= start && d <= end) out[iso] = day
    }
    return out
  }, [marketByDate])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/macro/calendar?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          setReleases(toDisplayEvents(d.data.events))
          setMarketByDate(d.data.market_by_date ?? {})
          setMarketDaysList(d.data.market_days ?? [])
          setStorageMeta({
            status: d.data.storage_status,
            rows: d.data.stored_rows,
            syncAge: d.data.sync_age_hours,
          })
          setError(null)
        } else {
          setError(d.error || 'Failed to load calendar')
        }
      })
      .catch(() => setError('Failed to load calendar'))
      .finally(() => setLoading(false))
  }, [days])

  const byMonth = useMemo(() => groupByMonth(viewReleases), [viewReleases])
  const today = new Date().toISOString().slice(0, 10)

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="panel skeleton h-48 rounded" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="panel panel-body text-center py-8">
        <span className="font-mono text-xs text-red-400">{error}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-1">
        <p className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Source: SQLite store · FRED sync via daily cron only · view −{VIEW_PAST_DAYS}/+{VIEW_FUTURE_DAYS}d · export −7/+45d
          {storageMeta.status && (
            <span className="ml-2">
              · {storageMeta.status}
              {storageMeta.rows != null && ` · ${storageMeta.rows} stored rows`}
              {storageMeta.syncAge != null && storageMeta.status === 'stored'
                ? ` · synced ${storageMeta.syncAge.toFixed(1)}h ago`
                : ''}
            </span>
          )}
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            disabled={!exportPayload}
            onClick={() => exportPayload && exportMacroCalendarPdf(exportPayload)}
            className="flex items-center gap-1.5 px-2 py-1 btn-terminal disabled:opacity-40"
          >
            <FileDown className="w-3 h-3" />
            <span className="text-[10px] font-mono">EXPORT PDF</span>
          </button>
          <button
            type="button"
            disabled={!exportPayload}
            onClick={async () => {
              if (!exportPayload) return
              await navigator.clipboard.writeText(buildMacroCalendarText(exportPayload))
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="flex items-center gap-1.5 px-2 py-1 btn-terminal disabled:opacity-40"
          >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            <span className="text-[10px] font-mono">{copied ? 'COPIED' : 'COPY TEXT'}</span>
          </button>
        </div>
      </div>

      {/* Scrollable release list by month */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {[...byMonth.entries()].map(([monthKey, items]) => {
          const [y, m] = monthKey.split('-')
          const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          })
          return (
            <div key={monthKey} className="panel">
              <div className="panel-header">
                <span className="panel-title">{label}</span>
                <span className="panel-subtitle">{items.length} releases</span>
              </div>
              <div className="panel-body-sm space-y-1.5 max-h-64 overflow-y-auto">
                {items.map((r) => {
                  const color = CATEGORY_COLOR[r.category] ?? '#888'
                  const isPast = r.date < today
                  const isToday = r.date === today
                  const market = viewMarketByDate[r.date]
                  return (
                    <div
                      key={`${r.release_id}-${r.date}-${r.name}`}
                      className="flex items-start gap-2 py-1.5 border-b border-white/[0.04] last:border-0"
                    >
                      <div
                        className="w-1 self-stretch rounded-full shrink-0 mt-0.5"
                        style={{ background: color, opacity: isPast ? 0.45 : 1 }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="font-mono text-[10px] font-semibold truncate"
                            style={{ color: isToday ? '#ff6600' : 'rgba(255,255,255,0.85)' }}
                          >
                            {r.name}
                          </span>
                          <span
                            className="font-mono text-[9px] shrink-0 px-1 rounded"
                            style={{ color, background: `${color}18` }}
                          >
                            {r.category.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="font-mono text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                            {r.day_of_week}
                          </span>
                          <span className="mx-1">·</span>
                          {r.date}
                          {r.release_time_label && (
                            <>
                              <span className="mx-1">·</span>
                              <span style={{ color: 'rgba(255,255,255,0.55)' }}>
                                {r.release_time_label}
                              </span>
                            </>
                          )}
                          {isToday && <span className="ml-1.5 text-[#ff6600]">TODAY</span>}
                          {!isPast && !isToday && r.days_from_today > 0 && (
                            <span className="ml-1.5">in {r.days_from_today}d</span>
                          )}
                        </div>
                        {market && market.day_type !== 'weekend' && (
                          <div
                            className="font-mono text-[8px] mt-0.5"
                            style={{
                              color:
                                market.day_type === 'closed'
                                  ? 'rgba(255,120,120,0.75)'
                                  : 'rgba(255,153,0,0.75)',
                            }}
                          >
                            {market.day_type === 'closed' ? 'Market closed' : 'Early close 2:00 PM ET'}
                            {market.name !== 'Weekend' && market.name !== 'Market closed' && (
                              <span className="ml-1 opacity-80">({market.name})</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <CalendarLegend />

      {/* Visual month grids */}
      <div>
        <p className="font-mono text-[9px] px-1 mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Calendar view · colored cells = market status · dots = release type
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {[...byMonth.entries()].map(([monthKey, items]) => (
            <MonthGrid
              key={`grid-${monthKey}`}
              monthKey={monthKey}
              events={items}
              marketByDate={viewMarketByDate}
              today={today}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
