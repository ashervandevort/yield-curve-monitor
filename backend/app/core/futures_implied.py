"""Implied CTD yield from Treasury futures price and conversion factor."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional


def _years_to_maturity(settle: date, maturity: date) -> float:
    return max(0.25, (maturity - settle).days / 365.25)


def bond_price_from_yield(y: float, coupon_pct: float, years: float, freq: int = 2) -> float:
    """Clean price per $100 face at yield y (decimal)."""
    c = coupon_pct / freq
    n = max(1, int(round(years * freq)))
    y_period = y / freq
    if abs(y_period) < 1e-9:
        return 100.0 + c * n
    pv_coupons = sum(c / ((1 + y_period) ** i) for i in range(1, n + 1))
    pv_principal = 100.0 / ((1 + y_period) ** n)
    return pv_coupons + pv_principal


def implied_yield_from_futures(
    futures_price: float,
    conversion_factor: float,
    coupon_pct: float,
    maturity_iso: str,
    settle_iso: Optional[str] = None,
) -> Optional[float]:
    """
    Solve for CTD yield given futures price and CME conversion factor.

    Uses clean price ≈ futures_price × conversion_factor (both in % of par).
    """
    if conversion_factor <= 0 or futures_price <= 0:
        return None
    settle = datetime.strptime(settle_iso or date.today().isoformat(), '%Y-%m-%d').date()
    maturity = datetime.strptime(maturity_iso, '%Y-%m-%d').date()
    years = _years_to_maturity(settle, maturity)
    target_price = futures_price * conversion_factor

    lo, hi = 0.001, 0.20
    for _ in range(80):
        mid = (lo + hi) / 2
        px = bond_price_from_yield(mid, coupon_pct, years)
        if px > target_price:
            lo = mid
        else:
            hi = mid
    return round((lo + hi) / 2 * 100, 4)  # percent
