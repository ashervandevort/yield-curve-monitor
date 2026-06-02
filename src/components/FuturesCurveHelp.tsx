'use client'

import { FUTURES_CONTRACTS } from '@/types'

export default function FuturesCurveHelp() {
  return (
    <div
      className="rounded-[2px] px-3 py-2.5 font-mono text-[9px] leading-relaxed"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.4)',
      }}
    >
      <p className="mb-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
        <span style={{ color: '#ff6600' }}>Futures view</span>
        {' · '}
        Yields are FRED CTD-implied levels mapped to each contract&apos;s target maturity bucket — not live CME
        futures prices.
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {FUTURES_CONTRACTS.map((c) => (
          <span key={c.symbol} className="inline-flex items-baseline gap-1.5 shrink-0">
            <span className="font-semibold" style={{ color: '#00cccc' }}>
              {c.symbol}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.65)' }}>{c.name}</span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>({c.targetLabel})</span>
          </span>
        ))}
      </div>
    </div>
  )
}
