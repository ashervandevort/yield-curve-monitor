/** Shared copy for Treasury futures curve view (yfinance + CTD implied yields). */

export const FUTURES_CURVE_SHORT = 'Front-month continuous (Yahoo · CTD-implied)'

export const FUTURES_CURVE_DETAIL =
  'Implied CTD yields from Yahoo Finance continuous closes (ZT=F…UB=F) × stored CME conversion factor. ZN/TN and ZB/UB are distinct contracts. Rolls automatically at expiry — not a single deliverable history.'

export const FUTURES_HEATMAP_SHORT = 'Yield changes (bp)'

export const FUTURES_HEATMAP_DETAIL =
  'Per-contract implied yield changes in basis points. Conversion factor / CTD from stored metadata — update via POST /api/v1/futures/ctd when CME rolls deliverable.'

export const FUTURES_SNAPSHOT_FOOTER =
  'Prices: Yahoo Finance continuous. Yields: CTD-implied. Not CME official settlement.'

export const FUTURES_HISTORICAL_DETAIL =
  'Sparklines use Yahoo Finance front-month continuous implied yields (≈400-day backfill). Automatic roll at expiry; percentiles compare today vs that continuous series, not a single contract.'

/** @deprecated use FUTURES_CURVE_SHORT + InfoTip */
export const FUTURES_CURVE_SUBTITLE = FUTURES_CURVE_DETAIL

/** @deprecated use FUTURES_HEATMAP_SHORT + InfoTip */
export const FUTURES_HEATMAP_NOTE = FUTURES_HEATMAP_DETAIL
