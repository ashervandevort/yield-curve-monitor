/**
 * Next.js API route - Proxy to backend /fomc/snapshot
 */
import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8053'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/v1/fomc/snapshot?${searchParams.toString()}`,
      {
        headers: { 'Content-Type': 'application/json' },
        next: { revalidate: 60 },
      },
    )
    const data = await response.json()
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data.detail || 'Backend error' },
        { status: response.status },
      )
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error('FOMC API error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch FOMC snapshot' }, { status: 500 })
  }
}
