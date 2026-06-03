# TODO

## Launch (yield.252.capital)

- [x] GitHub secrets (HOSTINGER_*, SSH_*, FRED_API_KEY)
- [x] DNS + SSL + PM2 on 3059 / 8059
- [ ] GitHub secrets: **DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD** (same as Market Color)
- [x] VPS cron: `backend/scripts/cron/install_crontab.sh` (weekdays 23:00–23:45 UTC, auto on deploy)
- [ ] One-time: `python backend/scripts/migrate_sqlite_to_pg.py` (optional, if SQLite has history)

## Storage

| Env | Backend | Location |
|-----|---------|----------|
| Local | `CURVE_STORE_BACKEND=sqlite` | `backend/app/data/yield_curve_cache.sqlite` |
| VPS | `CURVE_STORE_BACKEND=postgres` | PostgreSQL `yield_curve.daily_curves` (shared `financial_data_db`) |

Reads: cache/DB first → FRED only for gaps. Daily cron backfills ~2 years.

## Port registry (252 VPS — authoritative)

| Port | App | Public URL |
|------|-----|------------|
| 3011 | simple-timesheet-frontend | simpletimesheet.io |
| 3012 | simple-timesheet-admin | simpletimesheet.io/admin |
| 3013 | simple-timesheet-platform | simpletimesheet.io/platform |
| 3050 | rainbow-rachel | rainbowrachel.com |
| 3051 | compute-futures | compute.252.capital |
| 3052 | market-color | color.252.capital |
| **3053** | **holo** | **holo.252.capital** |
| 3056 | golf-directory | golfdirectory.com |
| 3057 | new-era-creative | neweracreative.com |
| 3058 | atnc-landing | atnc.com |
| **3059** | **yield-curve frontend** | **yield.252.capital** |
| **8059** | **yield-curve-api** (localhost only) | — |
| 3060 | research-api | internal |

**Not used on VPS:** 3054, 3055 (old simple-timesheet notes — actual ports are 3011–3013).

Local dev on Mac: frontend **3053**, backend **8053**.

## Post-launch

- [ ] Favicon/OG verified on production URL
- [ ] Link from 252.capital homepage
