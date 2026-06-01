'use client'

import { useCallback, useState } from 'react'
import { Check, Share2 } from 'lucide-react'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://yield.252.capital'
const SHARE_TITLE = 'Yield Curve Monitor — Treasury Rates & DV01 Hedging'
const SHARE_TEXT =
  'Live FRED Treasury curve, key spreads, macro calendar, and Treasury futures hedge optimizer. Free at yield.252.capital'

export default function ShareButton() {
  const [copied, setCopied] = useState(false)

  const share = useCallback(async () => {
    const url = typeof window !== 'undefined' ? window.location.href : SITE_URL
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url })
        return
      } catch {
        /* user cancelled or unsupported */
      }
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  return (
    <button
      type="button"
      onClick={share}
      className="flex items-center gap-1.5 px-2 py-1 btn-terminal"
      title="Share Yield Curve Monitor"
    >
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Share2 className="w-3 h-3" />}
      <span className="text-[10px] font-mono hidden sm:inline">
        {copied ? 'LINK COPIED' : 'SHARE'}
      </span>
      <span className="text-[10px] font-mono sm:hidden">{copied ? 'OK' : 'SHARE'}</span>
    </button>
  )
}

export function ShareLinks() {
  const url = encodeURIComponent(SITE_URL)
  const text = encodeURIComponent(SHARE_TEXT)
  const title = encodeURIComponent(SHARE_TITLE)

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-[9px]">
      <span style={{ color: 'rgba(255,255,255,0.3)' }}>Share:</span>
      <a
        href={`https://twitter.com/intent/tweet?url=${url}&text=${text}`}
        target="_blank"
        rel="noopener noreferrer"
        className="px-2 py-0.5 rounded border border-white/10 hover:border-[#ff6600]/40 hover:text-[#ff6600] transition-colors"
        style={{ color: 'rgba(255,255,255,0.45)' }}
      >
        X / Twitter
      </a>
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${url}`}
        target="_blank"
        rel="noopener noreferrer"
        className="px-2 py-0.5 rounded border border-white/10 hover:border-[#ff6600]/40 hover:text-[#ff6600] transition-colors"
        style={{ color: 'rgba(255,255,255,0.45)' }}
      >
        LinkedIn
      </a>
      <a
        href={`mailto:?subject=${title}&body=${text}%20${url}`}
        className="px-2 py-0.5 rounded border border-white/10 hover:border-[#ff6600]/40 hover:text-[#ff6600] transition-colors"
        style={{ color: 'rgba(255,255,255,0.45)' }}
      >
        Email
      </a>
    </div>
  )
}
