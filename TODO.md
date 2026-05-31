# TODO

## Launch (yield.252.capital)

- [x] GitHub secrets (HOSTINGER_*, SSH_*, FRED_API_KEY)
- [x] DNS A record: yield.252.capital
- [x] Nginx site enabled (update proxy to **3059** — see below)
- [ ] SSL: `sudo certbot --expand --nginx -d yield.252.capital`
- [ ] Deploy succeeds (GitHub Actions → PM2 `yield-curve` + `yield-curve-api`)
- [ ] Verify https://yield.252.capital

## Port registry (252 VPS — do not collide)

| Port | App |
|------|-----|
| 3050 | rainbow-rachel |
| 3051 | compute-futures |
| 3052 | market-color |
| 3053 | simple-timesheet-frontend |
| 3054 | simple-timesheet-admin |
| 3055 | simple-timesheet-platform |
| 3056 | golf-directory |
| 3057 | new-era-creative |
| 3058 | atnc-landing |
| **3059** | **yield-curve (yield.252.capital)** |
| **8053** | **yield-curve-api (localhost only)** |

Local dev may still use 3053/8053 on your Mac.

## Post-launch

- [ ] Favicon/OG verified on production URL
- [ ] Link from 252.capital homepage
