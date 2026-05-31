/**
 * Next.js API route – Proxy to backend /hedge/optimize
 */
import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8053'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    let response: Response
    try {
      response = await fetch(`${BACKEND_URL}/api/v1/hedge/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (connErr) {
      // Backend unreachable (ECONNREFUSED, etc.)
      console.error('Backend connection failed:', connErr)
      return NextResponse.json(
        {
          success: false,
          error: 'Backend unavailable – ensure the FastAPI server is running on port 8053.',
        },
        { status: 503 },
      )
    }

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data.detail || 'Optimization failed' },
        { status: response.status },
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Hedge optimize API error:', error)
    return NextResponse.json(
      { success: false, error: 'Unexpected error processing optimization request.' },
      { status: 500 },
    )
  }
}
