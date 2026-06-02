/** Shared copy for Treasury futures curve view (yfinance + CTD implied yields). */

export const FUTURES_CURVE_SUBTITLE =
  'Implied CTD yields from yfinance closes × CME conversion factor · ZN/TN and ZB/UB are distinct contracts'

export const FUTURES_HEATMAP_NOTE =
  'Per-contract implied yield changes (bp) · CF/CTD from stored metadata — update via /api/v1/futures/ctd when CME rolls deliverable'

export const FUTURES_SNAPSHOT_FOOTER =
  'Prices: Yahoo Finance (ZT=F…UB=F). Yields: CTD-implied from conversion factor. Not CME official settlement.'
