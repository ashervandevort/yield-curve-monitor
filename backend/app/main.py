"""FastAPI application for Yield Curve Monitor."""
import time

from fastapi import Request
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1 import curve, hedge, macro
from .core import settings

app = FastAPI(
    title="Yield Curve Monitor API",
    description="Treasury yield curve data and hedging optimizer",
    version="1.0.0",
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3053",
        "http://127.0.0.1:3053",
        "https://yield.252.capital",
        "https://curves.252.capital",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(curve.router, prefix="/api/v1")
app.include_router(hedge.router, prefix="/api/v1")
app.include_router(macro.router, prefix="/api/v1")


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Attach basic request timing for deployment and CI smoke checks."""
    start_time = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start_time) * 1000
    response.headers["X-Process-Time-Ms"] = f"{elapsed_ms:.2f}"
    return response


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "Yield Curve Monitor API",
        "version": "1.0.0",
        "endpoints": {
            "curve": "/api/v1/curve",
            "macro": "/api/v1/macro",
            "hedge": "/api/v1/hedge",
            "docs": "/docs",
        }
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "fred_configured": bool(settings.FRED_API_KEY),
        "curve_cache_path": settings.SQLITE_CACHE_PATH,
        "curve_cache_max_age_hours": settings.CURVE_CACHE_MAX_AGE_HOURS,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )
