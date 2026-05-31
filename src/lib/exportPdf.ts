/**
 * Export Treasury yield curve monitor snapshot to letter-size PDF (8.5 × 11 in).
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { TENOR_ORDER, SpreadsData, YieldCurve } from '@/types'

const SITE_URL = 'https://yield.252.capital'
const BRAND_URL = 'https://252.capital'
const BRAND = '252.capital'

export interface PdfExportPayload {
  curve: YieldCurve
  spreads: SpreadsData & {
    regime?: { level: number; slope: number; curvature: number; label: string }
  }
  changes: Record<string, { from_date: string; to_date: string; changes: Record<string, number> }>
  curveType: 'full' | 'futures'
}

type AutoTableDoc = jsPDF & { lastAutoTable?: { finalY: number } }

export function exportYieldCurvePdf(payload: PdfExportPayload): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' }) as AutoTableDoc
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 44
  let y = margin

  // Header
  doc.setFillColor(255, 102, 0)
  doc.rect(0, 0, pageW, 4, 'F')
  doc.setTextColor(20, 20, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Treasury Yield Curve Monitor', margin, y)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text(`As of ${payload.curve.date}  ·  Source: FRED (Federal Reserve Economic Data)`, margin, y + 16)
  doc.setTextColor(0, 120, 140)
  doc.textWithLink(SITE_URL, pageW - margin - doc.getTextWidth(SITE_URL), y, { url: SITE_URL })
  y += 36

  const tenors = payload.curveType === 'futures'
    ? ['2Y', '5Y', '10Y', '30Y']
    : TENOR_ORDER

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 102, 0)
  doc.text('Current Yields', margin, y)
  y += 8

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Tenor', 'Yield (%)']],
    body: tenors
      .filter((t) => payload.curve.yields[t] !== undefined)
      .map((t) => [t, payload.curve.yields[t].toFixed(3)]),
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [15, 19, 24], textColor: 255 },
  })
  y = (doc.lastAutoTable?.finalY ?? y) + 18

  if (payload.spreads?.spreads) {
    doc.setTextColor(255, 102, 0)
    doc.text('Key Spreads (bp)', margin, y)
    y += 8

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Spread', 'Description', 'Value (bp)', 'Signal']],
      body: Object.entries(payload.spreads.spreads).map(([name, s]) => [
        name,
        s.description,
        s.value.toFixed(1),
        s.interpretation,
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [15, 19, 24], textColor: 255 },
    })
    y = (doc.lastAutoTable?.finalY ?? y) + 10

    if (payload.spreads.regime) {
      const r = payload.spreads.regime
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(60, 60, 60)
      doc.text(
        `Regime: ${r.label}  ·  2s10s slope ${r.slope} bp  ·  Curvature ${r.curvature} bp  ·  Avg level ${r.level}%`,
        margin,
        y + 8,
      )
      y += 22
    }
  }

  if (payload.changes && Object.keys(payload.changes).length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 102, 0)
    doc.text('Yield Changes (bp)', margin, y)
    y += 8

    const windows = ['1D', '1W', '1M', '1Y'].filter((w) => payload.changes[w])
    const changeTenors = tenors.filter((t) =>
      windows.some((w) => payload.changes[w]?.changes[t] !== undefined),
    )

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Tenor', ...windows]],
      body: changeTenors.map((t) => [
        t,
        ...windows.map((w) => {
          const v = payload.changes[w]?.changes[t]
          if (v === undefined) return '—'
          return v > 0 ? `+${v}` : `${v}`
        }),
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 4, halign: 'center' },
      headStyles: { fillColor: [15, 19, 24], textColor: 255 },
      columnStyles: { 0: { halign: 'left' } },
    })
  }

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const footY = doc.internal.pageSize.getHeight() - 32
    doc.setDrawColor(220, 220, 220)
    doc.line(margin, footY - 6, pageW - margin, footY - 6)
    doc.setFontSize(8)
    doc.setTextColor(100, 100, 100)
    doc.text('Not financial advice. DV01 values are approximations.', margin, footY + 4)
    const provided = 'Provided by '
    const brandW = doc.getTextWidth(BRAND)
    const provW = doc.getTextWidth(provided)
    const x = pageW - margin - provW - brandW
    doc.text(provided, x, footY + 4)
    doc.setTextColor(255, 102, 0)
    doc.textWithLink(BRAND, x + provW, footY + 4, { url: BRAND_URL })
  }

  doc.save(`yield-curve-${payload.curve.date}.pdf`)
}
