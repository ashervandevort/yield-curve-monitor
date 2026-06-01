import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8053'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const days = searchParams.get('days') || '90'
  const refresh = searchParams.get('refresh') === 'true'

  try {
    const params = new URLSearchParams({ days })
    if (refresh) params.set('refresh', 'true')
    const url = `${BACKEND_URL}/api/v1/macro/calendar?${params.toString()}`
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 3600 },
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
    console.error('Macro calendar API error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch macro calendar' }, { status: 500 })
  }
}
