'use client'

import { motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import { CurveMetadata } from '@/types'
import ShareButton from '@/components/ShareButton'

interface StatusBarProps {
  /** FRED curve observation date (YYYY-MM-DD) */
  curveDate?: string | null
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
  curveDate,
  lastUpdated,
  loading,
  onRefresh,
  backendStatus,
  curveMetadata,
}: StatusBarProps) {
  const dataStatus: DataStatus =
    backendStatus === 'disconnected'
      ? 'offline'
      : backendStatus === 'checking'
        ? 'checking'
        : curveMetadata?.stale || curveMetadata?.is_partial
          ? 'stale'
          : 'live'

  const cfg = STATUS_CONFIG[dataStatus]

  const formatRefreshTime = (date: Date) =>
    date.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    })

  return (
    <div
      className="shrink-0 px-3 sm:px-4 py-2 sm:py-0 sm:h-10 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      style={{
        background: '#0f1318',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3 min-w-0">
        <span
          className="font-mono text-[10px] sm:text-xs font-semibold tracking-widest shrink-0"
          style={{ color: '#ff6600', letterSpacing: '0.12em' }}
        >
          YC MONITOR
        </span>
        <div className="hidden sm:block divider-v h-4" />
        {curveDate ? (
          <span className="font-mono text-[10px] sm:text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Curve <span className="text-yellow-400/90">{curveDate}</span>
          </span>
        ) : (
          <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>···</span>
        )}
        <div className="flex sm:hidden items-center gap-1.5 ml-auto">
          <motion.div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: cfg.dot }}
            animate={{ opacity: dataStatus === 'checking' ? [1, 0.3, 1] : 1 }}
            transition={{ duration: 1.5, repeat: dataStatus === 'checking' ? Infinity : 0 }}
          />
          <span className="font-mono text-[10px] font-semibold" style={{ color: cfg.color }}>
            {cfg.label}
          </span>
        </div>
      </div>

      <div className="hidden md:flex items-center justify-center flex-1 pointer-events-none">
        <span
          className="font-mono font-semibold tracking-widest text-xs"
          style={{ color: 'rgba(255,102,0,0.85)', letterSpacing: '0.2em' }}
        >
          TREASURY YIELD CURVE
        </span>
      </div>

      <div className="flex items-center justify-center sm:justify-end gap-2 sm:gap-3 flex-wrap">
        <div className="hidden sm:flex items-center gap-1.5">
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
            <span className="font-mono text-[9px] uppercase hidden lg:inline" style={{ color: 'rgba(255,255,255,0.25)' }}>
              · {curveMetadata.cache_status}
            </span>
          )}
        </div>

        {lastUpdated && (
          <>
            <div className="hidden sm:block divider-v h-4" />
            <span className="font-mono text-[9px] sm:text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              refreshed {formatRefreshTime(lastUpdated)}
            </span>
          </>
        )}

        <div className="hidden sm:block divider-v h-4" />

        <ShareButton />

        <div className="hidden sm:block divider-v h-4" />

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
