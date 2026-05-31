/**
 * Next.js API route - Proxy to backend /hedge/instruments
 */
import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8053'

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/hedge/instruments`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 3600 },
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
    console.error('Hedge instruments API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch hedge instruments' },
      { status: 500 }
    )
  }
}
