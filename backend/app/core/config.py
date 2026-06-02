"""Configuration management for yield curve backend."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load backend/.env first, then optional project-root .env
_backend_root = Path(__file__).parent.parent.parent
load_dotenv(_backend_root / '.env')
load_dotenv(_backend_root.parent / '.env')


class Settings:
    """Application settings loaded from environment."""

    # FRED API
    FRED_API_KEY: str = os.getenv('FRED_API_KEY', '')
    FRED_BASE_URL: str = 'https://api.stlouisfed.org/fred'

    # Database – SQLite (local dev) or PostgreSQL (VPS, shared with Market Color)
    CURVE_STORE_BACKEND: str = os.getenv('CURVE_STORE_BACKEND', 'sqlite')  # sqlite | postgres
    DB_HOST: str = os.getenv('DB_HOST', 'localhost')
    DB_PORT: int = int(os.getenv('DB_PORT', '5432'))
    DB_NAME: str = os.getenv('DB_NAME', 'financial_data_db')
    DB_USER: str = os.getenv('DB_USER', '')
    DB_PASSWORD: str = os.getenv('DB_PASSWORD', '')
    DATABASE_URL: str = os.getenv(
        'DATABASE_URL',
        'postgresql://localhost:5432/yield_curve'
    )
    SQLITE_CACHE_PATH: str = os.getenv(
        'SQLITE_CACHE_PATH',
        str(Path(__file__).parent.parent / 'data' / 'yield_curve_cache.sqlite')
    )
    CURVE_CACHE_MAX_AGE_HOURS: int = int(os.getenv('CURVE_CACHE_MAX_AGE_HOURS', '18'))
    MACRO_SYNC_MAX_AGE_HOURS: int = int(os.getenv('MACRO_SYNC_MAX_AGE_HOURS', '24'))

    # Server
    HOST: str = os.getenv('HOST', '0.0.0.0')
    PORT: int = int(os.getenv('PORT', '8053'))  # local dev; prod uses 8059 (+5000 from :3059)

    # ── Tenor definitions ──────────────────────────────────────────────────────

    # Full Treasury curve (all valid FRED DGS tenors; 2M and 4M are not published by FRED)
    FULL_TENORS: list[str] = [
        '1M', '3M', '6M',
        '1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'
    ]

    # Futures-chart symbols (distinct CME contracts via yfinance)
    FUTURES_SYMBOLS: list[str] = ['ZT', 'ZF', 'ZN', 'TN', 'ZB', 'UB']

    # Legacy tenor buckets (FRED proxy — superseded by FUTURES_SYMBOLS)
    FUTURES_TENORS: list[str] = ['2Y', '5Y', '10Y', '30Y']

    # Key-rate DV01 tenors used by the hedge optimizer (7-point grid)
    KEY_RATE_TENORS: list[str] = ['2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y']

    # ── FRED series map ────────────────────────────────────────────────────────
    FRED_SERIES: dict[str, str] = {
        '1M':  'DGS1MO',
        '3M':  'DGS3MO',
        '6M':  'DGS6MO',
        '1Y':  'DGS1',
        '2Y':  'DGS2',
        '3Y':  'DGS3',
        '5Y':  'DGS5',
        '7Y':  'DGS7',
        '10Y': 'DGS10',
        '20Y': 'DGS20',
        '30Y': 'DGS30',
    }

    # ── Treasury futures ───────────────────────────────────────────────────────
    #
    # Key-rate DV01 exposures are approximate (see assumptions below).
    # They represent how each futures contract loads onto each of the 7
    # key-rate tenor nodes.  Exposures sum to approximately dv01_approx.
    #
    # Methodology (Route A – static table):
    #   • Primary exposure centred on the CTD deliverable basket.
    #   • Neighbour spillover reflects duration smearing from off-the-run
    #     bonds in the basket and partial sensitivity to adjacent key rates.
    #   • Values are NOT recalculated daily; treat as "directionally correct"
    #     approximations for hedging.
    FUTURES_CONTRACTS: dict[str, dict] = {
        'ZT': {
            'name': '2-Year T-Note',
            'tenor_mapping': '2Y',
            'contract_size': 200_000,
            'dv01_approx': 38,          # $/bp per contract
            'tick_size': 0.0078125,     # 1/128 of a point
            'exposures': {
                '2Y': 34.0,
                '3Y':  4.0,
            },
        },
        'ZF': {
            'name': '5-Year T-Note',
            'tenor_mapping': '5Y',
            'contract_size': 100_000,
            'dv01_approx': 47,
            'tick_size': 0.0078125,
            'exposures': {
                '2Y':  3.0,
                '3Y':  5.0,
                '5Y': 36.0,
                '7Y':  3.0,
            },
        },
        'ZN': {
            'name': '10-Year T-Note',
            'tenor_mapping': '10Y',
            'contract_size': 100_000,
            'dv01_approx': 78,
            'tick_size': 0.015625,      # 1/64 of a point
            'exposures': {
                '5Y':  6.0,
                '7Y': 10.0,
                '10Y': 58.0,
                '20Y':  4.0,
            },
        },
        'TN': {
            'name': 'Ultra 10-Year T-Note',
            'tenor_mapping': '10Y',
            'contract_size': 100_000,
            'dv01_approx': 95,
            'tick_size': 0.015625,
            'exposures': {
                '5Y':  3.0,
                '7Y':  8.0,
                '10Y': 74.0,
                '20Y': 10.0,
            },
        },
        'ZB': {
            'name': '30-Year T-Bond',
            'tenor_mapping': '30Y',
            'contract_size': 100_000,
            'dv01_approx': 165,
            'tick_size': 0.03125,       # 1/32 of a point
            'exposures': {
                '10Y': 12.0,
                '20Y': 28.0,
                '30Y': 125.0,
            },
        },
        'UB': {
            'name': 'Ultra T-Bond',
            'tenor_mapping': '30Y',
            'contract_size': 100_000,
            'dv01_approx': 230,
            'tick_size': 0.03125,
            'exposures': {
                '10Y':  6.0,
                '20Y': 16.0,
                '30Y': 208.0,
            },
        },
    }


settings = Settings()
