# Yield Curve Monitor — Marketing Reference

Use this for landing copy, social bios, pitch decks, and subdomain branding. Not user-facing in the app.

---

## One-liners

- **Primary:** Treasury curve monitor and DV01 hedge optimizer — FRED data, futures sizing, Bloomberg-style UI.
- **Short:** See the curve. Size the hedge.
- **Technical:** 7-point key-rate DV01 hedging across ZT–UB with scenario P&L and factor analytics.
- **Audience:** Built for family offices, institutional PMs, and rates desks who want clarity without a terminal seat.

---

## Elevator pitch (≈30 sec)

Yield Curve Monitor pulls the full U.S. Treasury curve from FRED, tracks spreads and regime in real time, and lets you build a target duration profile — by key rate or by notional — then optimizes a Treasury futures hedge across six contracts. You get integer contract counts, margin estimates, Fed ±25bp scenario P&L, and level/slope/curvature factor exposure. One API key. No data vendor lock-in.

---

## Product name & URL

| Item | Recommendation |
|------|----------------|
| Product name | Yield Curve Monitor |
| Short name | YC Monitor (in-app status bar) |
| URL | **yield.252.capital** |
| Parent brand | 252.capital |
| Repo | github.com/ashervandevort/yield-curve-monitor |

---

## Suggested handles & hashtags

Pick what’s available on X/LinkedIn; these are starting points:

| Platform | Handle ideas |
|----------|----------------|
| X / Twitter | `@252yield`, `@yield252`, `@252curves` |
| LinkedIn | Company page under 252.capital; product line “Yield Curve Monitor” |
| Hashtags | `#Treasury`, `#YieldCurve`, `#Rates`, `#DV01`, `#FixedIncome`, `#Macro` |

**Bio template (160 chars):**  
Treasury yield curve + DV01 hedge optimizer. FRED-backed. Futures sizing ZT–UB. By 252.capital → yield.252.capital

---

## Feature bullets (marketing)

### Monitor
- Full Treasury curve (1M–30Y) from FRED, refreshed with smart cache
- Overlay today vs 1D / 1W / 1M / 1Y
- BP change heatmap with linked crosshair
- Key spreads: 2s10s, 3m10y, 5s30s, butterflies — spot levels, not ambiguous “changes”
- Curve regime: level, slope, curvature, inversion alerts

### Hedge
- 7-point key-rate DV01 grid (2Y–30Y)
- Position builder: notional × duration → target DV01
- Six Treasury futures with visible KRD exposure profiles
- Optimizer modes: full hedge, lean, balanced, custom
- Integer contracts, face value, margin per line
- Scenario P&L including **Fed ±25bp** hike/cut
- Factor analytics: level, slope, curvature
- Rebalance from existing book

### Experience
- Bloomberg-inspired dark terminal UI
- Proximity-linked charts (not fragile hover states)
- Responsive layout for desk and laptop
- Single external API (FRED) — simple to host and maintain

---

## Target users

| Segment | Use case |
|---------|----------|
| Family offices | Monitor curve shape, size macro hedges, explain risk to principals |
| Asset managers | Quick rates snapshot, futures hedge sizing before execution desk |
| Rates / macro PMs | Spread and regime dashboard, scenario P&L on DV01 books |
| Researchers / strategists | Curve visualization, spread history, hedge effectiveness metrics |

---

## Differentiators

1. **Hedge + monitor in one tool** — Not just a chart site; includes a real DV01 optimizer
2. **7-point KRD** — Finer than naive 2Y/5Y/10Y/30Y bucketing
3. **Fed scenario built in** — ±25bp labeled explicitly for policy meetings
4. **Honest model boundaries** — Approximate DV01, disclosed assumptions (trust with sophisticated users)
5. **Lightweight ops** — FRED + SQLite; no Bloomberg, no paid market data feed required
6. **252.capital stack** — Same deploy pattern as color.252.capital (GitHub Actions, Hostinger, PM2)

---

## Copy blocks (reuse freely)

### Hero
**Treasury curve intelligence. Futures hedge sizing.**  
Live FRED data, key spreads, and a 7-point DV01 optimizer across Treasury futures — in a terminal built for rates people.

### Sub-hero
Enter your duration target by key rate or notional. Get integer contract recommendations, scenario P&L, and factor exposure — before you call the broker.

### Trust / disclaimer (footer)
Data from FRED. DV01 and margin figures are approximations for analysis, not trade instructions. Not investment advice.

---

## Comparison framing (soft, not competitive)

| Alternative | Yield Curve Monitor |
|-------------|---------------------|
| Static FRED charts | Interactive overlays, heatmap, regime, spreads |
| Spreadsheet hedge math | Optimizer + scenarios + factor decomposition |
| Full Bloomberg terminal | Focused rates workflow; free FRED; self-hosted |
| Generic “finance dashboards” | Purpose-built for U.S. Treasury curve + futures DV01 |

---

## Launch checklist (marketing)

- [ ] DNS live: yield.252.capital
- [ ] SSL valid
- [ ] OG image / favicon (optional polish)
- [ ] Link from 252.capital main site
- [ ] One LinkedIn / X post with hero + screenshot
- [ ] Internal disclaimer visible (footer already notes FRED + approximations)

---

## Tone & voice

- **Do:** Precise, institutional, calm. Numbers and tenors. “Spot spread”, “$/bp”, “Fed ±25bp”.
- **Don’t:** Hype crypto-style language, “guaranteed alpha”, or hide model limitations.

---

## Outstanding product polish (not blocking launch)

- Live futures prices for mark-to-market notional (today: par face only)
- Daily CTD/DV01 refresh (today: static exposure table)
- OG image + favicon
- Link from 252.capital homepage
