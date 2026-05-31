'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import { CurveMetadata } from '@/types'

interface StatusBarProps {
  lastUpdated: Date | null
  loading: boolean
  onRefresh: () => void
  backendStatus: 'connected' | 'disconnected' | 'checking'
  curveMetadata?: CurveMetadata | null
}

type DataStatus = 'live' | 'stale' | 'offline' | 'checking'

const STATUS_CONFIG: Record<DataStatus, { color: string; dot: string; label: string }> = {
  live:     { color: '#00cc66', dot: '#00cc66', label: 'LIVE' },
  stale:    { color: '#ff9900', dot: '#ff9900', label: 'STALE' },
  offline:  { color: '#ff3333', dot: '#ff3333', label: 'OFFLINE' },
  checking: { color: 'rgba(255,255,255,0.3)', dot: 'rgba(255,255,255,0.3)', label: '···' },
}

export default function StatusBar({
  lastUpdated,
  loading,
  onRefresh,
  backendStatus,
  curveMetadata,
}: StatusBarProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null)

  useEffect(() => {
    setCurrentTime(new Date())
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })

  const formatDateShort = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })

  const dataStatus: DataStatus =
    backendStatus === 'disconnected'
      ? 'offline'
      : backendStatus === 'checking'
        ? 'checking'
        : curveMetadata?.stale || curveMetadata?.is_partial
          ? 'stale'
          : 'live'

  const cfg = STATUS_CONFIG[dataStatus]

  return (
    <div
      className="flex items-center justify-between px-4 h-10 shrink-0 relative"
      style={{
        background: '#0f1318',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Left: Live clock */}
      <div className="flex items-center gap-3">
        <span
          className="font-mono text-xs font-semibold tracking-widest"
          style={{ color: '#ff6600', letterSpacing: '0.12em' }}
        >
          YC MONITOR
        </span>
        <div className="divider-v h-4" />
        {currentTime ? (
          <div className="flex items-center gap-2 font-mono text-xs">
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>{formatDateShort(currentTime)}</span>
            <span style={{ color: 'rgba(255,255,255,0.75)' }}>{formatTime(currentTime)}</span>
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '9px' }}>
              {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </span>
          </div>
        ) : (
          <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
            ···
          </span>
        )}
      </div>

      {/* Center: Title (absolute-positioned for true centering) */}
      <div className="absolute inset-x-0 flex items-center justify-center pointer-events-none">
        <span
          className="font-mono font-semibold tracking-widest text-xs hidden sm:block"
          style={{ color: 'rgba(255,102,0,0.85)', letterSpacing: '0.2em' }}
        >
          TREASURY YIELD CURVE
        </span>
      </div>

      {/* Right: Status + controls */}
      <div className="flex items-center gap-3">
        {/* Data freshness */}
        <div className="flex items-center gap-1.5">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ background: cfg.dot }}
            animate={{ opacity: dataStatus === 'checking' ? [1, 0.3, 1] : 1 }}
            transition={{ duration: 1.5, repeat: dataStatus === 'checking' ? Infinity : 0 }}
          />
          <span className="font-mono text-xs font-semibold" style={{ color: cfg.color }}>
            {cfg.label}
          </span>
          {curveMetadata?.cache_status && dataStatus !== 'offline' && (
            <span
              className="font-mono text-[9px] uppercase"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              · {curveMetadata.cache_status}
            </span>
          )}
        </div>

        {/* Data date */}
        {lastUpdated && currentTime && (
          <>
            <div className="divider-v h-4" />
            <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              as of {formatTime(lastUpdated)}
            </span>
          </>
        )}

        <div className="divider-v h-4" />

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-2 py-1 btn-terminal"
          title="Refresh data"
        >
          <motion.div
            animate={{ rotate: loading ? 360 : 0 }}
            transition={{ duration: 0.8, repeat: loading ? Infinity : 0, ease: 'linear' }}
          >
            <RefreshCw className="w-3 h-3" />
          </motion.div>
          <span className="text-[10px] hidden sm:inline">REFRESH</span>
        </button>
      </div>
    </div>
  )
}
