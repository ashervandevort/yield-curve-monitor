'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface MeetingOutlook {
  meeting_date: string
  title?: string
  polymarket_url?: string | null
  event_slug?: string | null
  unavailable?: boolean
  probabilities: Record<string, number>
  probability_delta_1d?: Record<string, number>
}

interface FomcSnapshot {
  next_meeting: {
    date: string
    day_of_week: string
    decision_at_et: string
    decision_at_utc: string
  } | null
  countdown: { days: number; hours: number; minutes: number; seconds: number }
  target_range: { lower: number | null; upper: number | null; midpoint: number | null }
  effective_rate: number | null
  implied_rate: number | null
  zq_implied?: number | null
  probabilities: Record<string, number>
  probability_source: string
  probability_note: string
  polymarket_url?: string | null
  meeting_outlook?: MeetingOutlook[]
  probability_delta_1d?: Record<string, number>
}

const OUTCOME_ROWS = [
  { key: 'cut_25bp', label: '−25 bp', color: '#00cc66' },
  { key: 'hold', label: 'Hold', color: '#00cccc' },
  { key: 'hike_25bp', label: '+25 bp', color: '#ff3333' },
] as const

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function CountdownBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center min-w-[52px]">
      <div className="font-mono text-2xl sm:text-3xl font-bold tabular-nums" style={{ color: '#ff6600' }}>
        {pad(value)}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-widest mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
        {label}
      </div>
    </div>
  )
}

function formatMeetingLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDeltaPp(delta?: number) {
  if (delta === undefined || !Number.isFinite(delta) || Math.abs(delta) < 0.05) return null
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(0)}pp 24h`
}

function DeltaSubscript({ delta, color }: { delta?: number; color: string }) {
  const text = formatDeltaPp(delta)
  if (!text) return null
  return (
    <span className="font-mono text-[8px] ml-1 tabular-nums" style={{ color: 'rgba(255,255,255,0.4)' }}>
      <span style={{ color }}>{text}</span>
    </span>
  )
}

function MeetingOutlookCard({ meeting }: { meeting: MeetingOutlook }) {
  const label = formatMeetingLabel(meeting.meeting_date)
  if (meeting.unavailable) {
    return (
      <div className="rounded border p-3" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
        <div className="font-mono text-[10px] font-semibold mb-1" style={{ color: '#00cccc' }}>{label}</div>
        <p className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Market not matched</p>
      </div>
    )
  }

  return (
    <div className="rounded border p-3" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-mono text-[10px] font-semibold" style={{ color: '#00cccc' }}>{label}</div>
          {meeting.title && (
            <div className="font-mono text-[8px] mt-0.5 truncate max-w-[140px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {meeting.title}
            </div>
          )}
        </div>
        {meeting.polymarket_url && (
          <a
            href={meeting.polymarket_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[8px] shrink-0 hover:underline"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            ↗
          </a>
        )}
      </div>
      <div className="space-y-2">
        {OUTCOME_ROWS.map(({ key, label: outcomeLabel, color }) => {
          const pct = (meeting.probabilities[key] ?? 0) * 100
          return (
            <div key={key}>
              <div className="flex justify-between font-mono text-[9px] mb-0.5">
                <span style={{ color: 'rgba(255,255,255,0.45)' }}>{outcomeLabel}</span>
                <span className="tabular-nums font-semibold" style={{ color }}>
                  {pct.toFixed(0)}%
                  <DeltaSubscript delta={meeting.probability_delta_1d?.[key]} color={color} />
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  className="h-full rounded-full"
                  style={{ background: color, opacity: 0.85 }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MeetingComparisonGrid({ outlook }: { outlook: MeetingOutlook[] }) {
  const meetings = outlook.filter((m) => !m.unavailable).slice(0, 4)
  if (meetings.length === 0) return null

  return (
    <div className="panel">
      <div className="panel-header flex-col sm:flex-row gap-1">
        <span className="panel-title">Cross-Meeting Outlook</span>
        <span className="panel-subtitle">Polymarket odds by meeting · same scale as next-meeting panel</span>
      </div>
      <div className="panel-body-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {meetings.map((m) => (
            <MeetingOutlookCard key={m.meeting_date} meeting={m} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ProbabilityBars({
  probabilities,
  deltas,
  source,
  note,
  polymarketUrl,
}: {
  probabilities: Record<string, number>
  deltas?: Record<string, number>
  source: string
  note: string
  polymarketUrl?: string | null
}) {
  return (
    <div className="panel">
      <div className="panel-header flex-col sm:flex-row gap-1">
        <span className="panel-title">Next Meeting Odds</span>
        <span className="panel-subtitle">{source}</span>
      </div>
      <div className="panel-body-sm space-y-3">
        {OUTCOME_ROWS.map(({ key, label, color }) => {
          const pct = (probabilities[key] ?? 0) * 100
          return (
            <div key={key}>
              <div className="flex justify-between font-mono text-[10px] mb-1">
                <span style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>
                <span style={{ color }}>
                  {pct.toFixed(0)}%
                  <DeltaSubscript delta={deltas?.[key]} color={color} />
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  className="h-full rounded-full"
                  style={{ background: color, opacity: 0.85 }}
                />
              </div>
            </div>
          )
        })}
        <p className="font-mono text-[9px] pt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {note}
        </p>
        {polymarketUrl && (
          <a
            href={polymarketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block font-mono text-[10px] mt-1 px-2 py-1 rounded border"
            style={{ color: '#00cccc', borderColor: 'rgba(0,204,204,0.25)' }}
          >
            View on Polymarket ↗
          </a>
        )}
      </div>
    </div>
  )
}

export default function FomcPanel() {
  const [data, setData] = useState<FomcSnapshot | null>(null)
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/fomc/snapshot')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          setData(d.data)
          if (d.data.countdown) setCountdown(d.data.countdown)
        } else setError(d.error ?? 'Failed to load')
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!data?.next_meeting?.decision_at_utc) return
    const target = new Date(data.next_meeting.decision_at_utc as string)
    const tick = () => {
      const now = new Date()
      const diff = Math.max(0, target.getTime() - now.getTime())
      const total = Math.floor(diff / 1000)
      setCountdown({
        days: Math.floor(total / 86400),
        hours: Math.floor((total % 86400) / 3600),
        minutes: Math.floor((total % 3600) / 60),
        seconds: total % 60,
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [data?.next_meeting?.decision_at_utc])

  if (loading) {
    return (
      <div className="panel panel-body">
        <div className="skeleton h-32 rounded" />
      </div>
    )
  }

  if (error || !data?.next_meeting) {
    return (
      <div className="panel panel-body text-center py-8">
        <span className="font-mono text-xs text-red-400">{error ?? 'No upcoming FOMC meeting'}</span>
      </div>
    )
  }

  const { lower, upper, midpoint } = data.target_range
  const outlook = data.meeting_outlook ?? []

  return (
    <div className="space-y-3">
      <div className="panel">
        <div className="panel-header flex-col sm:flex-row gap-2">
          <span className="panel-title">Next FOMC Decision</span>
          <span className="panel-subtitle">
            {data.next_meeting.day_of_week} {data.next_meeting.date} · 2:00 PM ET · {countdown.days}d to decision
          </span>
        </div>
        <div className="panel-body flex flex-col items-center py-6">
          <div className="flex items-center gap-3 sm:gap-5">
            <CountdownBlock value={countdown.days} label="Days" />
            <span className="font-mono text-xl" style={{ color: 'rgba(255,255,255,0.2)' }}>:</span>
            <CountdownBlock value={countdown.hours} label="Hours" />
            <span className="font-mono text-xl" style={{ color: 'rgba(255,255,255,0.2)' }}>:</span>
            <CountdownBlock value={countdown.minutes} label="Min" />
            <span className="font-mono text-xl" style={{ color: 'rgba(255,255,255,0.2)' }}>:</span>
            <CountdownBlock value={countdown.seconds} label="Sec" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Policy Rate (FRED)</span>
          </div>
          <div className="panel-body-sm space-y-2">
            <div className="stat-row">
              <span className="stat-label">TARGET RANGE</span>
              <span className="font-mono text-sm font-semibold" style={{ color: '#00cccc' }}>
                {lower != null && upper != null ? `${lower.toFixed(2)}–${upper.toFixed(2)}%` : '—'}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">EFFECTIVE (DFF)</span>
              <span className="font-mono text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
                {data.effective_rate?.toFixed(2) ?? '—'}%
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">FF FUTURES (ZQ)</span>
              <span className="font-mono text-sm font-semibold" style={{ color: '#ff6600' }}>
                {data.zq_implied?.toFixed(2) ?? data.implied_rate?.toFixed(2) ?? midpoint?.toFixed(2) ?? '—'}%
              </span>
            </div>
          </div>
        </div>

        <ProbabilityBars
          probabilities={data.probabilities}
          deltas={data.probability_delta_1d}
          source={data.probability_source}
          note={data.probability_note}
          polymarketUrl={data.polymarket_url}
        />
      </div>

      {outlook.length > 0 && <MeetingComparisonGrid outlook={outlook} />}
    </div>
  )
}
