/**
 * Export Treasury yield curve monitor snapshot to letter-size PDF (8.5 × 11 in).
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { TENOR_ORDER, FUTURES_CONTRACTS, SpreadsData, YieldCurve, getHeatmapColor } from '@/types'

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

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function drawYieldCurveChart(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  labels: string[],
  yields: number[],
): number {
  if (labels.length < 2) return y
  const min = Math.min(...yields) - 0.15
  const max = Math.max(...yields) + 0.15
  const pad = 8
  const plotW = w - pad * 2
  const plotH = h - 24

  doc.setDrawColor(220, 220, 220)
  doc.rect(x, y, w, h)
  doc.setFontSize(8)
  doc.setTextColor(255, 102, 0)
  doc.text('Yield curve snapshot', x + pad, y + 10)

  const pts = labels.map((_, i) => {
    const px = x + pad + (i / (labels.length - 1)) * plotW
    const py = y + 16 + plotH - ((yields[i] - min) / (max - min)) * plotH
    return { px, py, label: labels[i], val: yields[i] }
  })

  doc.setDrawColor(0, 204, 204)
  doc.setLineWidth(1.2)
  for (let i = 0; i < pts.length - 1; i++) {
    doc.line(pts[i].px, pts[i].py, pts[i + 1].px, pts[i + 1].py)
  }
  pts.forEach((p) => {
    doc.setFillColor(0, 204, 204)
    doc.circle(p.px, p.py, 2, 'F')
    doc.setTextColor(80, 80, 80)
    doc.text(p.label, p.px - 6, y + h - 4)
    doc.text(`${p.val.toFixed(2)}%`, p.px - 10, p.py - 4)
  })
  return y + h + 12
}

function drawHeatmapGrid(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  windows: string[],
  columns: string[],
  values: (number | null)[][],
): number {
  const cellW = Math.min(36, (w - 40) / columns.length)
  const cellH = 16
  doc.setFontSize(8)
  doc.setTextColor(255, 102, 0)
  doc.text('Yield changes heatmap (bp)', x, y)
  y += 10
  columns.forEach((col, ci) => {
    doc.setTextColor(100, 100, 100)
    doc.text(col, x + 36 + ci * cellW, y)
  })
  y += 8
  windows.forEach((win, ri) => {
    doc.setTextColor(255, 102, 0)
    doc.text(win, x, y + ri * cellH + 10)
    columns.forEach((_, ci) => {
      const v = values[ri]?.[ci]
      const color = v !== null && v !== undefined ? getHeatmapColor(v) : '#1a2232'
      const [r, g, b] = hexToRgb(color)
      doc.setFillColor(r, g, b)
      doc.rect(x + 36 + ci * cellW, y + ri * cellH, cellW - 2, cellH - 2, 'F')
      if (v !== null && v !== undefined) {
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(7)
        doc.text(v > 0 ? `+${v}` : `${v}`, x + 38 + ci * cellW, y + ri * cellH + 10)
      }
    })
  })
  return y + windows.length * cellH + 16
}

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

  const tenors =
    payload.curveType === 'futures'
      ? FUTURES_CONTRACTS.map((c) => c.symbol)
      : TENOR_ORDER.filter((t) => payload.curve.yields[t] !== undefined)

  const yieldValues =
    payload.curveType === 'futures'
      ? FUTURES_CONTRACTS.filter((c) => payload.curve.yields[c.tenor] !== undefined).map(
          (c) => payload.curve.yields[c.tenor],
        )
      : tenors.map((t) => payload.curve.yields[t as keyof typeof payload.curve.yields])

  const chartLabels =
    payload.curveType === 'futures'
      ? FUTURES_CONTRACTS.filter((c) => payload.curve.yields[c.tenor] !== undefined).map((c) => c.symbol)
      : (tenors as string[])

  y = drawYieldCurveChart(doc, margin, y, pageW - margin * 2, 100, chartLabels, yieldValues)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 102, 0)
  doc.text('Current Yields', margin, y)
  y += 8

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Tenor', 'Yield (%)']],
    body: (payload.curveType === 'futures'
      ? FUTURES_CONTRACTS.filter((c) => payload.curve.yields[c.tenor] !== undefined)
      : tenors.map((t) => ({ symbol: t, tenor: t }))
    ).map((row) => {
      const t = 'tenor' in row ? row.tenor : row
      const label = 'symbol' in row ? row.symbol : row
      return [label, payload.curve.yields[t as string].toFixed(3)]
    }),
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
    const windows = ['1D', '1W', '1M', '1Y'].filter((w) => payload.changes[w])
    const hmCols =
      payload.curveType === 'futures'
        ? FUTURES_CONTRACTS.map((c) => c.symbol)
        : TENOR_ORDER.filter((t) =>
            windows.some((w) => payload.changes[w]?.changes[t] !== undefined),
          )
    const hmTenors =
      payload.curveType === 'futures'
        ? FUTURES_CONTRACTS.map((c) => c.tenor)
        : hmCols
    const hmValues = windows.map((w) =>
      hmTenors.map((t) => payload.changes[w]?.changes[t] ?? null),
    )

    if (y > 520) {
      doc.addPage()
      y = margin
    }
    y = drawHeatmapGrid(doc, margin, y, pageW - margin * 2, windows, hmCols, hmValues)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 102, 0)
    doc.text('Yield Changes (bp)', margin, y)
    y += 8

    const changeTenors = hmCols
    const changeKeys = hmTenors

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Tenor', ...windows]],
      body: changeTenors.map((label, i) => [
        label,
        ...windows.map((w) => {
          const v = payload.changes[w]?.changes[changeKeys[i]]
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
