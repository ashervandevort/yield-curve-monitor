Yeah—this is a very buildable app. It’s basically (1) a yield-curve “state + change” monitor and (2) a hedging optimizer that matches a target DV01 / key-rate DV01 profile using Treasury futures. The lift is mostly data plumbing + a clean risk representation, not “hard ML.”

1) Data: what to use (simple + reliable)

Yield curve levels (for charting)

Two good sources:
	•	FRED “DGS” constant-maturity yields (easy, stable, standard tenors like 1M, 3M, 6M, 1Y, 2Y, …, 30Y). Example series: DGS1MO, DGS3MO, …, DGS30.  ￼
	•	Treasury.gov “Daily Treasury Yield Curve Rates” (more curve points incl. 1, 1.5, 2, 3, 4, 6 months + 1–30 years, sourced around ~3:30pm each trading day).  ￼

For an MVP, I’d start with FRED DGS (fast to ship), then optionally upgrade to Treasury.gov for extra tenors.

Fetching via API

FRED’s API is straightforward (series/observations endpoint), requires an API key.  ￼

⸻

2) Yield curve monitor: the visuals that make it “feel” pro

Core views (high impact, low complexity):
	1.	Yield curve today (line chart, tenors on x-axis, yields on y-axis)
	2.	Snapshot compare (overlay today vs 1D / 1W / 1M / 1Y ago)
	3.	Δ-by-tenor heatmap (rows = tenors, cols = windows; cell = bp change)
	4.	Time slider “curve playback” (drag date, curve updates)
	5.	Key spreads (2s10s, 5s30s, 3m10y, etc.) and a “steepening/flattening” indicator

If you want it to slap visually: do the heatmap + overlay and a small multiples panel (each tenor’s mini sparkline). That’s enough to feel Bloomberg-ish without overengineering.

⸻

3) Hedging optimizer: the clean MVP method

What you’re optimizing

Represent everything as a vector of DV01 exposures at key tenors:
	•	Target: t = [DV01_2y, DV01_5y, DV01_10y, DV01_30y, ...]
	•	Each hedge instrument (e.g., ZT, ZF, ZN, TN, ZB, UB) has its own exposure vector a_i
	•	Choose contract counts x to match t

Solve something like:

\min_x \|A x - t\|^2 \;+\; \lambda \cdot \text{(cost / complexity penalties)}
Subject to bounds, optional integer rounding, max contracts, etc.

Where the futures DV01 comes from

For physically-deliverable Treasury futures, DV01 is typically derived from the CTD bond and its conversion factor (BPV/DV01 of CTD divided by CF). CME explains this approach.  ￼

For MVP, you can do one of two routes:

Route A (fastest): “per-contract DV01 table”
	•	Start with published / example DV01-per-contract values (and refresh later). CME educational material includes example per-contract DV01s across the curve.  ￼
	•	Treat each future as mapping primarily to a key point (2y/5y/10y/30y) and optionally smear small weights to neighboring tenors.

Route B (more “real”): CTD-aware DV01
	•	Pull CTD + conversion factor, compute contract DV01 daily.
	•	Better accuracy, but requires additional data (deliverables, CFs, CTD selection logic). CME has background on conversion factors and DV01 math.  ￼

Pragmatic recommendation: ship Route A first, design your code so Route B can drop in behind the same interface.

Key Rate DV01 (KRD) approximation for MVP

If your portfolio target is coming from user-entered key-rate DV01s (e.g., “I’m +$50k/bp at 5y, -$20k/bp at 10y”), you’re good.

If instead you want the app to compute KRD from a cash portfolio later, that’s a separate module (price bonds, bump curve nodes, compute ΔPV/Δy). You can add it after the core app ships.

⸻

4) Suggested architecture (simple, scalable)

Backend (Python)
	•	FastAPI service with:
	•	GET /curve/latest
	•	GET /curve/history?start=...&end=...
	•	GET /curve/changes?windows=1d,1w,1m,1y
	•	POST /hedge/optimize (target DV01 vector + instrument set + constraints)
	•	Data jobs
	•	daily fetch + store snapshot in Postgres (or even SQLite to start)
	•	cache “latest” in memory/Redis
	•	Libraries: pandas/numpy, scipy; add cvxpy if you want constraints/penalties cleanly.

Frontend
	•	Next.js (you already live here) + a charting library (Plotly, ECharts, or D3)
	•	Pages:
	•	/curve (monitor)
	•	/hedge (optimizer + results + “achieved vs target” chart)
	•	optional /scenarios (parallel shift / steepener / flattener shocks)

⸻

5) Build plan (so you can jump into the IDE and go)

Sprint 1 — Yield curve monitor (ship this first)
	•	FRED fetcher (DGS series), normalize into one tidy table
	•	Store daily snapshots
	•	Frontend: curve line chart + overlays + Δ heatmap

Sprint 2 — Hedging optimizer MVP
	•	Define key tenors (e.g., 2/5/10/30 or 2/3/5/7/10/20/30)
	•	Build instrument exposure matrix A (start with DV01-per-contract assumptions)
	•	Optimize (least squares), then integer rounding
	•	Output: contracts + achieved DV01 by tenor + residuals

Sprint 3 — Accuracy upgrades
	•	CTD-aware DV01 + conversion-factor logic
	•	Add constraints: max contracts, prefer fewer instruments, minimize margin usage
	•	Add micro/alt products if desired (CME also has micro Treasury / yield products; some are explicitly DV01-sized).  ￼

⸻

If you want, next we can lock down (a) your exact “key tenors” set and (b) which futures you want in the hedge universe (ZT/ZF/ZN/TN/ZB/UB, micros, etc.), and I’ll translate that into a concrete JSON schema for the optimizer request/response plus a folder structure you can paste into a new repo.