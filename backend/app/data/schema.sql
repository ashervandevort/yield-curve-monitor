-- Yield Curve Monitor Database Schema
-- PostgreSQL schema for historical yield curve data

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS yield_curve;

-- Daily yield curve snapshots
CREATE TABLE IF NOT EXISTS yield_curve.daily_curves (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    tenor VARCHAR(10) NOT NULL,
    yield_pct DECIMAL(6, 4) NOT NULL,  -- e.g., 4.2500 for 4.25%
    source VARCHAR(20) DEFAULT 'FRED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(date, tenor)
);

-- Index for fast date lookups
CREATE INDEX IF NOT EXISTS idx_daily_curves_date ON yield_curve.daily_curves(date);
CREATE INDEX IF NOT EXISTS idx_daily_curves_tenor ON yield_curve.daily_curves(tenor);

-- Yield changes cache (precomputed for performance)
CREATE TABLE IF NOT EXISTS yield_curve.yield_changes (
    id SERIAL PRIMARY KEY,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    tenor VARCHAR(10) NOT NULL,
    change_bp DECIMAL(8, 2) NOT NULL,  -- Change in basis points
    window VARCHAR(10) NOT NULL,  -- '1D', '1W', '1M', '1Y'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(from_date, to_date, tenor)
);

CREATE INDEX IF NOT EXISTS idx_yield_changes_to_date ON yield_curve.yield_changes(to_date);

-- Key spreads history
CREATE TABLE IF NOT EXISTS yield_curve.spreads (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    spread_name VARCHAR(20) NOT NULL,  -- '2s10s', '5s30s', '3m10y', etc.
    value_bp DECIMAL(8, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(date, spread_name)
);

CREATE INDEX IF NOT EXISTS idx_spreads_date ON yield_curve.spreads(date);

-- Hedging history (for audit/tracking)
CREATE TABLE IF NOT EXISTS yield_curve.hedge_requests (
    id SERIAL PRIMARY KEY,
    request_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    target_dv01 JSONB NOT NULL,
    result_contracts JSONB NOT NULL,
    achieved_dv01 JSONB NOT NULL,
    residual JSONB NOT NULL,
    total_residual DECIMAL(12, 2) NOT NULL,
    margin_estimate DECIMAL(12, 2)
);

-- View for latest curve
CREATE OR REPLACE VIEW yield_curve.latest_curve AS
SELECT 
    date,
    tenor,
    yield_pct
FROM yield_curve.daily_curves
WHERE date = (SELECT MAX(date) FROM yield_curve.daily_curves)
ORDER BY 
    CASE tenor
        WHEN '1M' THEN 1
        WHEN '2M' THEN 2
        WHEN '3M' THEN 3
        WHEN '4M' THEN 4
        WHEN '6M' THEN 5
        WHEN '1Y' THEN 6
        WHEN '2Y' THEN 7
        WHEN '3Y' THEN 8
        WHEN '5Y' THEN 9
        WHEN '7Y' THEN 10
        WHEN '10Y' THEN 11
        WHEN '20Y' THEN 12
        WHEN '30Y' THEN 13
    END;

-- Function to insert or update a yield
CREATE OR REPLACE FUNCTION yield_curve.upsert_yield(
    p_date DATE,
    p_tenor VARCHAR(10),
    p_yield DECIMAL(6, 4),
    p_source VARCHAR(20) DEFAULT 'FRED'
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO yield_curve.daily_curves (date, tenor, yield_pct, source)
    VALUES (p_date, p_tenor, p_yield, p_source)
    ON CONFLICT (date, tenor) 
    DO UPDATE SET yield_pct = EXCLUDED.yield_pct, source = EXCLUDED.source;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE yield_curve.daily_curves IS 'Daily Treasury yield curve snapshots from FRED';
COMMENT ON TABLE yield_curve.yield_changes IS 'Precomputed yield changes for different time windows';
COMMENT ON TABLE yield_curve.spreads IS 'Historical key spread values (2s10s, 5s30s, etc.)';
COMMENT ON TABLE yield_curve.hedge_requests IS 'Audit log of hedging optimization requests';
