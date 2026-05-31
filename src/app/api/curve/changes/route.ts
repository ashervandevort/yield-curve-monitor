/**
 * Next.js API route - Proxy to backend /curve/changes
 */
import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8053'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const windows = searchParams.get('windows') || '1D,1W,1M,1Y'
  const curveType = searchParams.get('curve_type') || 'full'

  try {
    const url = `${BACKEND_URL}/api/v1/curve/changes?windows=${windows}&curve_type=${curveType}`

    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data.detail || 'Backend error' },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Curve changes API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch change data' },
      { status: 500 }
    )
  }
}
