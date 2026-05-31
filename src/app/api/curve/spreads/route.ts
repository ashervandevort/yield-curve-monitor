/**
 * Next.js API route - Proxy to backend /curve/spreads
 */
import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8053'

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/curve/spreads`, {
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
    console.error('Spreads API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch spreads' },
      { status: 500 }
    )
  }
}
