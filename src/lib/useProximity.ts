/**
 * Proximity-based tenor detection for yield curve charts.
 *
 * Instead of requiring the cursor to be near a data point, the hook
 * snaps to the nearest tenor column by X-coordinate.  This makes
 * exploration feel effortless – just move left/right.
 */
import { useState, useCallback } from 'react'

export interface ProximityPoint {
  tenor: string
  x: number      // pixel position (after margins) relative to the SVG origin
}

export interface ProximityState {
  activeTenor: string | null
  crosshairX: number          // px from left edge (including margin)
  rawY: number                // raw mouse Y (for tooltip placement)
}

const EMPTY: ProximityState = { activeTenor: null, crosshairX: 0, rawY: 0 }

export function useProximity(points: ProximityPoint[], leftMargin = 0) {
  const [state, setState] = useState<ProximityState>(EMPTY)

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGElement>) => {
      if (!points.length) return
      const rect = event.currentTarget.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top

      // Find nearest tenor by x-distance
      let nearest = points[0]
      let minDist = Infinity
      for (const pt of points) {
        const d = Math.abs(pt.x + leftMargin - mouseX)
        if (d < minDist) {
          minDist = d
          nearest = pt
        }
      }

      setState({
        activeTenor: nearest.tenor,
        crosshairX: nearest.x + leftMargin,
        rawY: mouseY,
      })
    },
    [points, leftMargin],
  )

  const handleMouseLeave = useCallback(() => {
    setState(EMPTY)
  }, [])

  return { ...state, handleMouseMove, handleMouseLeave }
}
