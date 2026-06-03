# TODO

## Launch (yield.252.capital) — done

- [x] GitHub secrets (HOSTINGER_*, SSH_*, FRED_API_KEY, DB_*)
- [x] DNS + SSL + PM2 on 3059 / 8059
- [x] VPS cron: `install_crontab.sh` (FRED/macro/futures/FOMC, weekdays 23:00–23:45 UTC)
- [x] Steady-state deploy (no SQLite→PG unless `MIGRATE_SQLITE_TO_PG=1`)
- [x] FOMC tab (Polymarket + FRED policy rates)
- [x] Futures curve (yfinance continuous + CTD-implied yields)
- [x] Historical context for spot + futures (ZT/ZN/ZB percentiles)

## Optional / later

- [ ] Link from 252.capital homepage
- [ ] Favicon/OG smoke check on production URL
- [ ] Polymarket **1W** delta (currently 24h pp subscript when prior snapshot exists)
- [ ] CTD refresh cron when CME publishes new conversion factors (`ctd_refresh.py`)

## Storage

| Env | Spot curve | Futures / FOMC / macro |
|-----|------------|-------------------------|
| Local | SQLite `backend/app/data/yield_curve_cache.sqlite` | Same SQLite file |
| VPS | PostgreSQL `yield_curve.daily_curves` (spot) | SQLite on release path (futures_daily, fomc snapshots, macro) |

Local dev: small SQLite seed is enough for UI testing — no PG migration required.

One-time PG migration (only if needed): `MIGRATE_SQLITE_TO_PG=1 python backend/scripts/migrate_sqlite_to_pg.py`

## Data refresh (VPS)

| Job | UTC (Mon–Fri) | What updates |
|-----|---------------|--------------|
| fred_daily | 23:00 | FRED CMT spot curve (prior US business day close) |
| macro_daily | 23:15 | Macro calendar store |
| futures_daily | 23:30 | Yahoo continuous futures closes + implied yields |
| fomc_daily | 23:45 | Polymarket odds + FRED policy rates |

FRED publishes ~4:15 PM ET; cron runs ~6–7 PM ET — same-day close, not T+1. Midday UI may show yesterday until that evening run.

Page refresh reads cache/DB only (no live FRED on every click).

## Port registry (252 VPS)

| Port | App | Public URL |
|------|-----|------------|
| 3059 | yield-curve frontend | yield.252.capital |
| 8059 | yield-curve-api (localhost) | — |

Local dev: frontend **3053**, backend **8053**.
