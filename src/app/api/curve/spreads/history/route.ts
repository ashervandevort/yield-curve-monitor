import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8053'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const spreads = searchParams.get('spreads') || '2s10s,3m10y'
  const days = searchParams.get('days') || '365'

  try {
    const url = `${BACKEND_URL}/api/v1/curve/spreads/history?spreads=${encodeURIComponent(spreads)}&days=${days}`
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    const data = await response.json()
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data.detail || 'Backend error' },
        { status: response.status },
      )
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error('Spread history API error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch spread history' }, { status: 500 })
  }
}
