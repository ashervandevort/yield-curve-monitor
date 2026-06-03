'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'

interface InfoTipProps {
  /** Short visible label (optional — icon-only if omitted) */
  label?: string
  children: React.ReactNode
  className?: string
}

/** Click/tap methodology note — keeps panel headers clean. */
export default function InfoTip({ label, children, className = '' }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const tipId = useId()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <span ref={rootRef} className={`relative inline-flex items-center gap-1 ${className}`}>
      {label ? (
        <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {label}
        </span>
      ) : null}
      <button
        type="button"
        aria-label="Methodology details"
        aria-expanded={open}
        aria-controls={tipId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-full p-0.5 transition-colors hover:bg-white/10"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        <Info size={11} strokeWidth={2} />
      </button>
      {open && (
        <span
          id={tipId}
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1.5 w-64 max-w-[min(16rem,calc(100vw-2rem))] rounded p-2.5 font-mono text-[9px] leading-relaxed shadow-lg"
          style={{
            background: '#0d1118',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.65)',
          }}
        >
          {children}
        </span>
      )}
    </span>
  )
}
