# Yield Curve Monitor

Professional Treasury yield curve monitor with hedging optimizer for traders.

## Features

- **Real-time Yield Curve Visualization** - visx-powered charts with smooth animations
- **Historical Overlays** - Compare today's curve vs 1D/1W/1M/1Y ago
- **Change Heatmap** - Basis point changes across tenors and time windows
- **Key Spreads Panel** - 2s10s, 5s30s, 3m10y with inversion alerts
- **Hedge Optimizer** - DV01-matching with Treasury futures (ZT, ZF, ZN, TN, ZB, UB)
- **Bloomberg-style UI** - Dark terminal aesthetic, sharp corners, orange accents

## Tech Stack

### Frontend
- Next.js 16 + TypeScript
- visx for data visualization
- Framer Motion for animations
- Tailwind CSS 4

### Backend
- FastAPI (Python)
- FRED API for yield data
- scipy/cvxpy for hedge optimization
- PostgreSQL for data persistence

## Quick Start

### 1. Environment Setup

Copy `.env.example` to `.env` and add your FRED API key:

```bash
cp .env.example .env
# Edit .env with your FRED_API_KEY
```

Get a free FRED API key at: https://fred.stlouisfed.org/docs/api/api_key.html

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Run backend (port 8053)
uvicorn app.main:app --reload --port 8053
```

### 3. Frontend Setup

```bash
# From project root
npm install

# Run frontend (port 3053)
npm run dev
```

### 4. Database (Optional)

For historical data persistence:

```bash
# Create PostgreSQL database
createdb yield_curve

# Run schema
psql yield_curve < backend/app/data/schema.sql
```

## Ports

| Service | Port |
|---------|------|
| Frontend | 3053 |
| Backend | 8053 |

## API Endpoints

### Curve Data
- `GET /api/v1/curve/latest` - Latest yield curve
- `GET /api/v1/curve/history` - Historical data
- `GET /api/v1/curve/changes` - BP changes by window
- `GET /api/v1/curve/spreads` - Key spreads (2s10s, etc.)

### Hedge Optimizer
- `POST /api/v1/hedge/optimize` - Optimize futures positions
- `GET /api/v1/hedge/instruments` - Available futures contracts
- `GET /api/v1/hedge/tenors` - Hedging tenors

## Curve Types

Toggle between two curve views:

1. **Full Curve** - All Treasury tenors (1M to 30Y)
2. **Futures Curve** - Key tenors matching futures (2Y, 5Y, 10Y, 30Y)

## Hedging

The optimizer finds Treasury futures positions to match your target DV01 profile:

```
Target: +$50k/bp at 2Y, -$30k/bp at 10Y
Result: Long 1316 ZT, Short 385 ZN
```

Uses least-squares optimization with integer rounding.

## Data Sources

- **Yield Data**: FRED DGS series (constant maturity Treasury rates)
- **DV01 Values**: Approximate per-contract values (actual depends on CTD bond)

## Deployment Notes

For VPS deployment to `/data-persistent`:

1. Update `DATABASE_URL` in production `.env`
2. Configure nginx for ports 3053/8053
3. Set up PM2 for process management
4. Configure cron for daily data collection

## License

Private - Internal use only
