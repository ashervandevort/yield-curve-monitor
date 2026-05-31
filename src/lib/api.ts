/**
 * API client for yield curve backend
 */

const API_BASE = '/api'

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || `API error: ${response.status}`)
  }

  return response.json()
}

// Curve endpoints
export async function getLatestCurve(curveType: 'full' | 'futures' = 'full') {
  return fetchApi(`/curve/latest?curve_type=${curveType}`)
}

export async function getCurveHistory(
  startDate: string,
  endDate: string,
  curveType: 'full' | 'futures' = 'full'
) {
  return fetchApi(
    `/curve/history?start_date=${startDate}&end_date=${endDate}&curve_type=${curveType}`
  )
}

export async function getCurveChanges(
  windows: string[] = ['1D', '1W', '1M', '1Y'],
  curveType: 'full' | 'futures' = 'full'
) {
  return fetchApi(
    `/curve/changes?windows=${windows.join(',')}&curve_type=${curveType}`
  )
}

export async function getSpreads() {
  return fetchApi('/curve/spreads')
}

// Hedge endpoints
export async function optimizeHedge(request: {
  target_dv01: Record<string, number>
  instruments?: string[]
  max_contracts?: number
}) {
  return fetchApi('/hedge/optimize', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

export async function getInstruments() {
  return fetchApi('/hedge/instruments')
}

export async function getHedgingTenors() {
  return fetchApi('/hedge/tenors')
}
