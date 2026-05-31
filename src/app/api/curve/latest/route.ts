/**
 * Next.js API route - Proxy to backend /curve/latest
 */
import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8053'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const curveType = searchParams.get('curve_type') || 'full'
  const tenors = searchParams.get('tenors')

  try {
    let url = `${BACKEND_URL}/api/v1/curve/latest?curve_type=${curveType}`
    if (tenors) {
      url += `&tenors=${tenors}`
    }

    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 60 },  // Cache for 1 minute
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
    console.error('Curve latest API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch curve data' },
      { status: 500 }
    )
  }
}
