/**
 * Proximity-based tenor detection for yield curve charts.
 */
import { useState, useCallback } from 'react'

export interface ProximityPoint {
  tenor: string
  x: number
}

export interface ProximityHit {
  activeTenor: string
  crosshairX: number
  rawY: number
}

const EMPTY = { activeTenor: null as string | null, crosshairX: 0, rawY: 0 }

export function useProximity(points: ProximityPoint[], leftMargin = 0) {
  const [state, setState] = useState(EMPTY)

  const resolveNearest = useCallback(
    (event: React.MouseEvent<SVGElement>): ProximityHit | null => {
      if (!points.length) return null
      const rect = event.currentTarget.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top

      let nearest = points[0]
      let minDist = Infinity
      for (const pt of points) {
        const d = Math.abs(pt.x + leftMargin - mouseX)
        if (d < minDist) {
          minDist = d
          nearest = pt
        }
      }

      return {
        activeTenor: nearest.tenor,
        crosshairX: nearest.x + leftMargin,
        rawY: mouseY,
      }
    },
    [points, leftMargin],
  )

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGElement>) => {
      const hit = resolveNearest(event)
      if (hit) {
        setState({
          activeTenor: hit.activeTenor,
          crosshairX: hit.crosshairX,
          rawY: hit.rawY,
        })
      }
    },
    [resolveNearest],
  )

  const handleMouseLeave = useCallback(() => {
    setState(EMPTY)
  }, [])

  return { ...state, handleMouseMove, handleMouseLeave, resolveNearest }
}
