# Yield Curve Monitor

Treasury yield curve monitor and DV01 hedge optimizer — built for desks, family offices, and asset managers who want FRED-backed curve data and futures hedging in one Bloomberg-style terminal.

**Production target:** [yield.252.capital](https://yield.252.capital)

---

## What it does

### Curve Monitor
- **Live Treasury curve** — 11 FRED tenors (1M–30Y), cached locally with per-tenor fallback
- **Historical overlays** — Compare today vs 1D / 1W / 1M / 1Y
- **Change heatmap** — Basis-point moves by tenor and window, linked to chart proximity
- **Key spreads** — 2s10s, 3m10y, 5s30s, butterflies; spot levels with regime labels (steep / inverted / normal)
- **Curve regime** — Level, slope, curvature, and label (NORMAL, FLAT, INVERTED, HUMPED)
- **Proximity interaction** — Crosshair-linked readouts across chart and heatmap (not hover-only)

### Hedge Optimizer
- **7-point key-rate grid** — 2Y, 3Y, 5Y, 7Y, 10Y, 20Y, 30Y ($/bp targets)
- **Position builder** — Enter notional + duration per leg → auto DV01
- **Treasury futures** — ZT, ZF, ZN, TN, ZB, UB with KRD exposure mini-charts
- **Optimization modes** — Full Hedge, Lean, Balanced, Custom (penalty / max contracts / tolerance)
- **Results** — Integer contract counts, face value, margin/contract, KRD profile, coverage %, residual pills
- **Scenario P&L** — Fed ±25bp, parallel shocks, steepener/flattener, belly moves
- **Risk analytics** — Level / slope / curvature factor exposures, hedge effectiveness %
- **Rebalancing** — Delta trades from an existing futures book
- **Unit toggle** — KRD ($/bp), years duration, $ P&L at 100bp, contracts

---

## Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | Next.js 16, TypeScript, visx, Framer Motion, Tailwind CSS 4 |
| Backend | FastAPI, scipy (L-BFGS-B + integer rounding) |
| Data | FRED API (spot), Yahoo Finance (futures), Polymarket (FOMC odds), SQLite + PostgreSQL cache |
| Deploy | GitHub Actions → Hostinger VPS, PM2, Nginx, weekday cron on VPS |

**External APIs:** FRED (`FRED_API_KEY`), Yahoo Finance (futures), Polymarket Gamma (FOMC — no key).

Production spot curve uses **PostgreSQL**; futures/FOMC/macro snapshots use **SQLite** on the release path. Local dev uses SQLite only.

### When does data update?

| Source | Typical lag | VPS cron (UTC, Mon–Fri) |
|--------|-------------|-------------------------|
| FRED spot yields | Same business day after ~4:15 PM ET | 23:00 |
| Yahoo futures | Same day after cash close | 23:30 |
| Polymarket FOMC | Intraday (stored on cron + page cache) | 23:45 |

Midday refresh shows the **last cron run** (often prior calendar day before ~7 PM ET). Not T+1 — evening cron picks up that day's close. Page auto-refresh reads cache only; it does not hit FRED on every tick.

Deploy runs incremental sync scripts but **does not** re-migrate SQLite→PG unless `MIGRATE_SQLITE_TO_PG=1` is set on the workflow.

---

## Local development

### 1. Environment

```bash
cp .env.example .env
# Set FRED_API_KEY — free at https://fred.stlouisfed.org/docs/api/api_key.html
```

### 2. Backend (port 8053)

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8053
```

### 3. Frontend (port 3053)

```bash
# From project root
pnpm install
pnpm dev
```

Open [http://localhost:3053](http://localhost:3053).

### Port map (252.capital VPS)

| Project | Frontend | Backend |
|---------|----------|---------|
| rainbow-rachel | 3050 | — |
| compute-futures | 3051 | — |
| market-color | 3052 | — |
| **yield-curve** | **3059** (prod) / 3053 (local dev) | **8053** |

Production uses **3059** on the VPS. Ports 3050–3058 are taken (see TODO.md registry).

---

## API (backend)

Base: `http://localhost:8053/api/v1` (proxied via Next.js `/api/*` in production)

| Endpoint | Description |
|----------|-------------|
| `GET /curve/latest` | Latest yield curve |
| `GET /curve/changes` | BP changes by window |
| `GET /curve/spreads` | Key spreads + regime |
| `GET /curve/history` | Historical series (spot or `curve_type=futures`) |
| `GET /fomc/snapshot` | FOMC countdown, Polymarket odds, FRED target range |
| `GET /futures/ctd` | CTD + conversion factor metadata |
| `POST /hedge/optimize` | Optimize futures hedge |
| `GET /hedge/instruments` | Contract specs + KRD profiles |
| `GET /hedge/tenors` | 7-point key-rate grid |
| `GET /health` | Backend health check |

---

## Hedging model (read before trading)

- **DV01 / KRD exposures** — Static approximation table per contract; not CTD-recalculated daily
- **Optimizer** — Least-squares over 7 key rates, then integer contract rounding
- **Margin** — Approximate CME initial margin per contract (SPAN varies daily)
- **Face value** — Par notional = \|contracts\| × contract face ($100k or $200k for ZT)
- **P&L scenarios** — P&L = −DV01 × Δrates (bp); illustrative, not execution prices

Suitable for **risk sizing and hedge design**. Not a substitute for live broker SPAN, CTD, or execution systems.

---

## Deployment (Hostinger / 252.capital)

**Subdomain:** `yield.252.capital`  
**Workflow:** `.github/workflows/deploy.yml` (adapted from market-color template)

### GitHub secrets

| Secret | What it is | Where to get it |
|--------|------------|-----------------|
| `HOSTINGER_HOST` | VPS IP address | Hostinger panel → VPS → IP (same server as color.252.capital) |
| `HOSTINGER_USER` | SSH login name | Usually **`deploy252`** on your 252 VPS |
| `SSH_PRIVATE_KEY` | **Private** SSH key (full file, no passphrase) | `~/.ssh/github_deploy_dec2025` — same key as other 252 VPS deploys |
| `FRED_API_KEY` | FRED API key | [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html) |

#### SSH secrets

Use the **passphrase-free** deploy key (`github_deploy_dec2025`). The workflow runs SSH in `BatchMode` — a passphrase-protected key will fail even when TCP connects.

```bash
pbcopy < ~/.ssh/github_deploy_dec2025   # paste into GitHub secret SSH_PRIVATE_KEY
```

#### If deploy fails with port 22 timeout

Failures are usually **TCP timeout from GitHub Actions → VPS**, not a bad key. Logs show `nc: connect … timed out` before any auth attempt.

1. **Hostinger hPanel** → VPS → **Firewall** — SSH (port 22) must allow **any IP**, not just your home IP. GitHub runner IPs change every run.
2. **Re-run workflow** — the deploy job retries TCP+SSH up to 8 times with backoff; queued deploys (`concurrency`) avoid parallel SSH storms.
3. **Durable fix (recommended):** install a [self-hosted GitHub Actions runner](https://docs.github.com/en/actions/hosting-your-own-runners) on the VPS so deploy runs locally with no inbound SSH from the cloud.

Successful runs log `Runner egress IP: …` — if timeouts persist, note that IP when opening a Hostinger support ticket.

### One-time VPS setup

1. **DNS** — A record: `yield` → VPS IP (Hostinger panel)
2. **Nginx** — `.github/workflows/nginx-template.conf` → `/etc/nginx/sites-available/yield-curve.conf`, enable, reload
3. **SSL** — `sudo certbot --expand --nginx -d yield.252.capital`
4. **Deploy** — Push to `main` or run workflow manually

PM2 processes: `yield-curve` (:3059), `yield-curve-api` (:8053). Backend is localhost-only; Nginx serves the frontend.

### Verify

```bash
curl -I https://yield.252.capital
ssh deploy252@<HOST> "curl -s http://127.0.0.1:8053/health && pm2 list"
```

---

## Tests

```bash
cd backend && venv/bin/python -m pytest tests/ -v
pnpm run type-check
```

---

## Marketing copy

See [`archive/MARKETING.md`](archive/MARKETING.md) for taglines, feature bullets, audience positioning, and suggested handles.

---

## License

Private — internal / 252.capital use.
