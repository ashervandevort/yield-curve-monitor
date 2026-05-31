'use client'

import { FileDown } from 'lucide-react'
import { exportYieldCurvePdf, PdfExportPayload } from '@/lib/exportPdf'

interface ExportPdfButtonProps {
  payload: PdfExportPayload | null
  disabled?: boolean
}

export default function ExportPdfButton({ payload, disabled }: ExportPdfButtonProps) {
  const handleExport = () => {
    if (!payload) return
    exportYieldCurvePdf(payload)
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled || !payload}
      className="flex items-center gap-1.5 px-2 py-1 btn-terminal disabled:opacity-40"
      title="Export letter-size PDF"
    >
      <FileDown className="w-3 h-3" />
      <span className="text-[10px] hidden sm:inline">EXPORT PDF</span>
      <span className="text-[10px] sm:hidden">PDF</span>
    </button>
  )
}
