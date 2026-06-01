'use client'

import { useRef, useState, useEffect, ReactNode } from 'react'

interface ChartContainerProps {
  /** Minimum width before horizontal scroll (default: none — always fit container) */
  minWidth?: number
  className?: string
  children: (width: number) => ReactNode
}

/** Measures container width so SVG charts fill the panel without fixed overflow. */
export default function ChartContainer({ minWidth, className = '', children }: ChartContainerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(minWidth ?? 320)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setWidth(Math.max(minWidth ?? 280, Math.floor(w)))
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [minWidth])

  return (
    <div ref={ref} className={`w-full ${className}`}>
      {children(width)}
    </div>
  )
}
