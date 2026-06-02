/**
 * Export macro calendar summary to PDF and plain text.
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { MacroRelease, MarketDay } from '@/types'
import {
  MACRO_CATEGORY_COLOR,
  MACRO_MARKET_STYLE,
  hexToRgb,
} from '@/lib/macroCalendarStyles'

const BRAND = '252.capital'
const SITE = 'yield.252.capital'
/** PDF section accent — readable on white (not orange/yellow) */
const PDF_SECTION_RGB: [number, number, number] = [15, 19, 24]
const PDF_TABLE_HEAD_RGB: [number, number, number] = [15, 19, 24]
const PDF_TABLE_HEAD_TEXT_RGB: [number, number, number] = [0, 204, 204]
const PDF_CALENDAR_MONTHS = 4

export interface MacroExportPayload {
  days: number
  releases: MacroRelease[]
  marketDays: MarketDay[]
  generatedAt?: Date
}

export const EXPORT_PAST_DAYS = 7
export const EXPORT_FUTURE_DAYS = 45

export function filterMacroExportPayload(
  payload: MacroExportPayload,
  pastDays = EXPORT_PAST_DAYS,
  futureDays = EXPORT_FUTURE_DAYS,
): MacroExportPayload {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - pastDays)
  const end = new Date(today)
  end.setDate(end.getDate() + futureDays)

  const inWindow = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00')
    return d >= start && d <= end
  }

  return {
    ...payload,
    days: pastDays + futureDays,
    releases: payload.releases.filter((r) => inWindow(r.date)),
    marketDays: payload.marketDays.filter(
      (d) =>
        inWindow(d.date) &&
        (d.day_type === 'closed' || d.day_type === 'early_close'),
    ),
  }
}

function formatEventLine(r: MacroRelease): string {
  const parts = [r.day_of_week, r.date, r.release_time_label, r.name].filter(Boolean)
  return parts.join(' · ')
}

export function buildMacroCalendarText(payload: MacroExportPayload): string {
  const { releases, marketDays, days } = payload
  const today = new Date().toISOString().slice(0, 10)
  const lines: string[] = [
    `Macro Calendar Summary · ±${days} days · ${today}`,
    `Generated ${(payload.generatedAt ?? new Date()).toLocaleString()}`,
    '',
    '=== ECONOMIC RELEASES ===',
  ]

  const sorted = [...releases].sort((a, b) => a.date.localeCompare(b.date))
  if (!sorted.length) {
    lines.push('No releases in range.')
  } else {
    for (const r of sorted) {
      lines.push(`• ${formatEventLine(r)} [${r.category.replace('_', ' ')}]`)
    }
  }

  const holidays = marketDays.filter((d) => d.day_type === 'closed' || d.day_type === 'early_close')
  lines.push('', '=== MARKET HOLIDAYS & EARLY CLOSES ===')
  if (!holidays.length) {
    lines.push('None in range.')
  } else {
    for (const d of holidays) {
      const suffix = d.day_type === 'early_close' ? ' · early close 2:00 PM ET' : ' · closed'
      lines.push(`• ${d.date} — ${d.name}${suffix}`)
    }
  }

  lines.push('', `Source: ${SITE} · ${BRAND}`)
  return lines.join('\n')
}

function drawCategoryDots(
  doc: jsPDF,
  cx: number,
  cy: number,
  cell: number,
  dayEvents: MacroRelease[],
) {
  const dots = dayEvents.slice(0, 4)
  if (!dots.length) return
  const dotR = Math.max(1.8, cell * 0.11)
  const gap = dotR * 2.4
  const totalW = (dots.length - 1) * gap
  const startX = cx + cell / 2 - totalW / 2
  dots.forEach((e, i) => {
    const hex = MACRO_CATEGORY_COLOR[e.category] ?? '#888888'
    const [r, g, b] = hexToRgb(hex)
    doc.setFillColor(r, g, b)
    doc.circle(startX + i * gap, cy + cell - dotR - 2, dotR, 'F')
  })
}

/** Month mini-grid centered in a quadrant box — mirrors front-end calendar */
function drawMonthQuadrant(
  doc: jsPDF,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  monthKey: string,
  events: MacroRelease[],
  marketByDate: Record<string, MarketDay>,
): void {
  const [yStr, mStr] = monthKey.split('-')
  const yNum = Number(yStr)
  const mNum = Number(mStr)
  const first = new Date(yNum, mNum - 1, 1)
  const daysInMonth = new Date(yNum, mNum, 0).getDate()
  const label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(30, 30, 30)
  doc.text(label, boxX + boxW / 2, boxY + 14, { align: 'center' })

  const headerH = 22
  const gridTop = boxY + headerH
  const gridH = boxH - headerH - 8
  const cell = Math.min(gridH / 7.5, (boxW - 4) / 7)
  const gridW = cell * 7
  const gridX = boxX + (boxW - gridW) / 2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(100, 100, 100)
  ;['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d, i) => {
    doc.text(d, gridX + i * cell + cell / 2, gridTop + 6, { align: 'center' })
  })

  const byDate = new Map<string, MacroRelease[]>()
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, [])
    byDate.get(e.date)!.push(e)
  }

  const startPad = first.getDay()
  let row = 0
  let col = startPad
  const dayGridY = gridTop + 10

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${yStr}-${mStr.padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const cx = gridX + col * cell
    const cy = dayGridY + row * cell
    const market = marketByDate[iso]
    const dayEvents = byDate.get(iso) ?? []
    const hasEvent = dayEvents.length > 0

    if (market?.day_type === 'closed') {
      const [r, g, b] = MACRO_MARKET_STYLE.closed.pdfFill
      doc.setFillColor(r, g, b)
    } else if (market?.day_type === 'early_close') {
      const [r, g, b] = MACRO_MARKET_STYLE.early_close.pdfFill
      doc.setFillColor(r, g, b)
    } else if (hasEvent) {
      doc.setFillColor(235, 242, 252)
    } else {
      doc.setFillColor(252, 252, 252)
    }

    doc.setDrawColor(210, 210, 210)
    doc.setLineWidth(0.25)
    doc.rect(cx, cy, cell - 0.5, cell - 0.5, 'FD')

    doc.setFontSize(8)
    doc.setTextColor(25, 25, 25)
    doc.text(String(day), cx + cell / 2, cy + 9, { align: 'center' })

    drawCategoryDots(doc, cx, cy, cell, dayEvents)

    col++
    if (col > 6) {
      col = 0
      row++
    }
  }
}

function drawCalendarOverviewPage(
  doc: jsPDF,
  marketByDate: Record<string, MarketDay>,
  months: [string, MacroRelease[]][],
) {
  const margin = 36
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const contentW = pageW - margin * 2
  const contentH = pageH - margin * 2 - 36

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...PDF_SECTION_RGB)
  doc.text('Calendar Overview', pageW / 2, margin + 6, { align: 'center' })

  const gap = 16
  const quadW = (contentW - gap) / 2
  const quadH = (contentH - gap - 16) / 2
  const startY = margin + 20

  months.slice(0, PDF_CALENDAR_MONTHS).forEach((entry, i) => {
    const [mk, evts] = entry
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = margin + col * (quadW + gap)
    const y = startY + row * (quadH + gap)

    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.5)
    doc.rect(x, y, quadW, quadH, 'S')

    drawMonthQuadrant(doc, x + 6, y + 6, quadW - 12, quadH - 12, mk, evts, marketByDate)
  })

  const legendY = pageH - margin - 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(100, 100, 100)
  doc.text(
    'Dots = release category · shaded cells = market closed or early close',
    pageW / 2,
    legendY - 10,
    { align: 'center' },
  )

  let lx = margin
  Object.entries(MACRO_CATEGORY_COLOR).forEach(([cat, hex]) => {
    const [r, g, b] = hexToRgb(hex)
    doc.setFillColor(r, g, b)
    doc.circle(lx + 3, legendY, 2.5, 'F')
    doc.setTextColor(70, 70, 70)
    doc.text(cat.replace('_', ' '), lx + 8, legendY + 2)
    lx += 72
  })
}

export function exportMacroCalendarPdf(payload: MacroExportPayload): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' }) as jsPDF & { lastAutoTable?: { finalY: number } }
  const margin = 40
  let y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(30, 30, 30)
  doc.text('Macro Calendar Summary', margin, y)
  y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(
    `${SITE} · ±${payload.days} days · ${(payload.generatedAt ?? new Date()).toLocaleString()}`,
    margin,
    y,
  )
  y += 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...PDF_SECTION_RGB)
  doc.text('Economic Releases', margin, y)
  y += 8

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Day', 'Time (ET)', 'Release', 'Category']],
    body: [...payload.releases]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => [
        r.date,
        r.day_of_week ?? '',
        r.release_time_label ?? '',
        r.name,
        r.category.replace('_', ' '),
      ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: PDF_TABLE_HEAD_RGB, textColor: PDF_TABLE_HEAD_TEXT_RGB },
    margin: { left: margin, right: margin },
  })

  y = (doc.lastAutoTable?.finalY ?? y) + 16
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PDF_SECTION_RGB)
  doc.text('Market Holidays & Early Closes', margin, y)
  y += 8

  const holidays = payload.marketDays.filter((d) => d.day_type !== 'weekend')
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Status', 'Name']],
    body: holidays.map((d) => [
      d.date,
      d.day_type === 'closed' ? 'Closed' : d.day_type === 'early_close' ? 'Early close' : d.day_type,
      d.name,
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: PDF_TABLE_HEAD_RGB, textColor: PDF_TABLE_HEAD_TEXT_RGB },
    margin: { left: margin, right: margin },
  })

  const marketByDate = Object.fromEntries(payload.marketDays.map((d) => [d.date, d]))
  const byMonth = new Map<string, MacroRelease[]>()
  for (const r of payload.releases) {
    const mk = r.date.slice(0, 7)
    if (!byMonth.has(mk)) byMonth.set(mk, [])
    byMonth.get(mk)!.push(r)
  }

  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))
  if (months.length > 0) {
    doc.addPage()
    drawCalendarOverviewPage(doc, marketByDate, months)
  }

  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  const footY = doc.internal.pageSize.getHeight() - 16
  doc.text(`${BRAND} · Not financial advice`, margin, footY)

  doc.save(`macro-calendar-${new Date().toISOString().slice(0, 10)}.pdf`)
}

export async function copyMacroCalendarText(payload: MacroExportPayload): Promise<void> {
  await navigator.clipboard.writeText(buildMacroCalendarText(payload))
}
