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
| Data | FRED API (DGS series), SQLite cache |
| Deploy | GitHub Actions → Hostinger VPS, PM2, Nginx |

**External API:** FRED only (`FRED_API_KEY`). No market data vendor required.

PostgreSQL schema exists for optional historical persistence; production uses SQLite cache by default.

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
| **yield-curve** | **3053** | **8053** |

3053 / 8053 are reserved for this app and do not overlap other 252 projects.

---

## API (backend)

Base: `http://localhost:8053/api/v1` (proxied via Next.js `/api/*` in production)

| Endpoint | Description |
|----------|-------------|
| `GET /curve/latest` | Latest yield curve |
| `GET /curve/changes` | BP changes by window |
| `GET /curve/spreads` | Key spreads + regime |
| `GET /curve/history` | Historical series |
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
| `SSH_PRIVATE_KEY` | **Private** SSH key (full file) | See below — **not** your Hostinger panel password |
| `SSH_PASSPHRASE` | Passphrase **for that SSH key** | Password you chose when creating the key (blank if none) |
| `FRED_API_KEY` | FRED API key | [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html) |

#### SSH secrets — which is which?

These are **not** your Hostinger hPanel login. They are for GitHub Actions to SSH into your VPS (same setup as `market-color` and other 252 projects).

1. **`SSH_PRIVATE_KEY`** — Paste the **entire private key file**, including `-----BEGIN ...-----` and `-----END ...-----` lines.  
   On your Mac you likely have `~/.ssh/github_deploy_dec2025` (Dec 2025 deploy key). If `market-color` already deploys successfully, use the **same private key** you put in that repo’s secrets.

   ```bash
   # Copy to clipboard (Mac) — paste into GitHub secret SSH_PRIVATE_KEY
   pbcopy < ~/.ssh/github_deploy_dec2025
   ```

2. **`SSH_PASSPHRASE`** — The optional password you set when running `ssh-keygen`.  
   - If you remember setting one for `github_deploy_dec2025`, use that.  
   - If the key has **no** passphrase, create the secret with a single space or leave empty (some workflows accept empty; if deploy fails, try the passphrase from your password manager for “github deploy” or “vps ssh”).

3. **Quick path:** Open GitHub → **market-color** repo → Settings → Secrets → Actions. You should see the same four infra secret **names**. Copy the **values** from wherever you stored them when you first set up market-color (GitHub won’t show them again — use your local key file + memory/1Password).

**Do not** paste the `.pub` file — only the private key (no `.pub` extension).

### One-time VPS setup

1. **DNS** — A record: `yield` → VPS IP (Hostinger panel)
2. **Nginx** — `.github/workflows/nginx-template.conf` → `/etc/nginx/sites-available/yield-curve.conf`, enable, reload
3. **SSL** — `sudo certbot --expand --nginx -d yield.252.capital`
4. **Deploy** — Push to `main` or run workflow manually

PM2 processes: `yield-curve` (:3053), `yield-curve-api` (:8053). Backend is localhost-only; Nginx serves the frontend.

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
