/**
 * Export hedge optimizer results to letter-size PDF.
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { HedgeResult } from '@/types'

const BRAND = '252.capital'
const BRAND_URL = 'https://252.capital'

type AutoTableDoc = jsPDF & { lastAutoTable?: { finalY: number } }

export function exportHedgePdf(result: HedgeResult): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' }) as AutoTableDoc
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 44
  let y = margin

  doc.setFillColor(255, 102, 0)
  doc.rect(0, 0, pageW, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(20, 20, 20)
  doc.text('DV01 Hedge Optimizer — Results', margin, y)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text(`Generated ${new Date().toLocaleString()} · yield.252.capital`, margin, y + 16)
  y += 40

  doc.setTextColor(255, 102, 0)
  doc.setFont('helvetica', 'bold')
  doc.text('Summary', margin, y)
  y += 10
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  doc.setFontSize(9)
  doc.text(
    `Effectiveness ${result.effectiveness.effectiveness_pct.toFixed(1)}% · ` +
      `Residual ratio ${(result.residual_ratio * 100).toFixed(1)}% · ` +
      `Within tolerance: ${result.within_tolerance ? 'Yes' : 'No'}`,
    margin,
    y,
  )
  y += 22

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Contract', 'Qty', 'DV01/ct', 'Total DV01', 'Direction']],
    body: result.contracts_detail.map((c) => [
      c.symbol,
      String(c.contracts),
      `$${c.dv01_per_contract}`,
      `$${Math.round(c.total_dv01).toLocaleString()}`,
      c.direction,
    ]),
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 19, 24], textColor: 255 },
  })
  y = (doc.lastAutoTable?.finalY ?? y) + 16

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Tenor', 'Target', 'Achieved', 'Residual', 'Cov %']],
    body: Object.keys(result.target_dv01).map((t) => {
      const target = result.target_dv01[t] ?? 0
      const achieved = result.achieved_dv01[t] ?? 0
      const residual = result.residual[t] ?? 0
      const cov = target !== 0 ? ((achieved / target) * 100).toFixed(0) : '—'
      return [t, `$${Math.round(target)}`, `$${Math.round(achieved)}`, `$${Math.round(residual)}`, cov]
    }),
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 19, 24], textColor: 255 },
  })
  y = (doc.lastAutoTable?.finalY ?? y) + 16

  if (result.scenarios?.length) {
    if (y > 620) {
      doc.addPage()
      y = margin
    }
    doc.setTextColor(255, 102, 0)
    doc.setFont('helvetica', 'bold')
    doc.text('Scenario P&L', margin, y)
    y += 8
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Scenario', 'Pre-Hedge', 'Hedge', 'Net']],
      body: result.scenarios.map((s) => [
        s.label,
        `$${Math.round(s.pre_hedge).toLocaleString()}`,
        `$${Math.round(s.hedge_pnl).toLocaleString()}`,
        `$${Math.round(s.net_pnl).toLocaleString()}`,
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [15, 19, 24], textColor: 255 },
    })
  }

  const footY = doc.internal.pageSize.getHeight() - 32
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text('Not financial advice. Approximate DV01 model.', margin, footY)
  doc.setTextColor(255, 102, 0)
  doc.textWithLink(BRAND, pageW - margin - doc.getTextWidth(BRAND), footY, { url: BRAND_URL })

  doc.save(`hedge-optimizer-${new Date().toISOString().slice(0, 10)}.pdf`)
}
