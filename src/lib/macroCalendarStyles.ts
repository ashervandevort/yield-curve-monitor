import { MarketDay } from '@/types'

/** Shared category colors — front-end calendar + PDF export */
export const MACRO_CATEGORY_COLOR: Record<string, string> = {
  monetary_policy: '#ff6600',
  inflation: '#9966ff',
  labor: '#00cc66',
  growth: '#ffcc00',
}

export const MACRO_MARKET_STYLE: Record<
  MarketDay['day_type'],
  { bg: string; border: string; label: string; pdfFill: [number, number, number] }
> = {
  closed: {
    bg: 'rgba(255,51,51,0.14)',
    border: 'rgba(255,80,80,0.35)',
    label: 'Market closed',
    pdfFill: [255, 210, 210],
  },
  early_close: {
    bg: 'rgba(255,153,0,0.12)',
    border: 'rgba(255,153,0,0.35)',
    label: 'Early close (2:00 PM ET)',
    pdfFill: [255, 228, 200],
  },
  weekend: {
    bg: 'rgba(255,255,255,0.015)',
    border: 'rgba(255,255,255,0.06)',
    label: 'Weekend',
    pdfFill: [248, 248, 248],
  },
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}
