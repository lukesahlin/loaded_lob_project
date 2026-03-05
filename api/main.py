"""
Options Flow Analytics — FastAPI Entry Point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import greeks, signals, volume

app = FastAPI(
    title="Options Flow Analytics API",
    description="Query MBO Parquet data via DuckDB. Returns JSON for frontend charts.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(volume.router)
app.include_router(greeks.router)
app.include_router(signals.router)


@app.get("/", tags=["health"])
def root():
    return {"status": "ok", "docs": "/docs"}


@app.get("/health", tags=["health"])
def health():
    return {"status": "healthy"}
