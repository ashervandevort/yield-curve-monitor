# TODO

## Launch (yield.252.capital)

- [ ] Add GitHub secrets to `yield-curve-monitor` repo:
  - `HOSTINGER_HOST` — VPS IP (same host as color.252.capital)
  - `HOSTINGER_USER` — typically `deploy252`
  - `SSH_PRIVATE_KEY`, `SSH_PASSPHRASE`
  - `FRED_API_KEY`
- [ ] DNS A record: `yield.252.capital` → VPS IP
- [ ] Nginx: deploy `.github/workflows/nginx-template.conf`, enable site, reload
- [ ] SSL: `certbot --expand --nginx -d yield.252.capital`
- [ ] Push to `main` or run deploy workflow manually
- [ ] Verify: `curl https://yield.252.capital` and `pm2 list` on VPS
- [ ] Optional: link from 252.capital homepage

## Ports (confirmed — no conflicts)

| Port | Service | Project |
|------|---------|---------|
| 3050 | Next.js | rainbow-rachel |
| 3051 | Next.js | compute-futures |
| 3052 | Next.js | market-color (color.252.capital) |
| 3053 | holo | holo.252.capital |
| **3054** | **yield-curve** | **yield.252.capital** |
| 3011–3013 | simple-timesheet | (3 apps) |
| **8053** | **FastAPI** | **yield-curve-api (localhost only)** |

Override locally via `PORT` env var (see README).

## Post-launch polish

- [ ] Favicon + OG image for yield.252.capital
- [ ] CORS: add `https://yield.252.capital` in `backend/app/main.py` if direct API access needed
- [ ] Optional PostgreSQL for long history (SQLite sufficient for v1)

## Future enhancements

- [ ] Dynamic DV01 from live CTD / futures prices
- [ ] Mark-to-market notional (face × price), not just par face
- [ ] Scheduled FRED refresh cron on VPS
