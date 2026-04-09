"""
DuckDB connection and query helpers.
Reads Parquet file(s) via DuckDB's native Parquet support.
"""
import os
from functools import lru_cache
from typing import Any

import duckdb

PARQUET_PATH = os.environ.get("PARQUET_PATH", "../data/flow.parquet")


def get_connection() -> duckdb.DuckDBPyConnection:
    return duckdb.connect(database=":memory:", read_only=False)


def parquet_ref() -> str:
    """Return a DuckDB table expression pointing to the Parquet file(s)."""
    path = PARQUET_PATH
    if path.endswith("/") or os.path.isdir(path):
        # Hive-partitioned directory
        return f"read_parquet('{path}**/*.parquet', hive_partitioning=true)"
    return f"read_parquet('{path}')"


def query(sql: str, params: list[Any] | None = None) -> list[dict]:
    con = get_connection()
    try:
        if params:
            result = con.execute(sql, params).fetchdf()
        else:
            result = con.execute(sql).fetchdf()
        # Replace NaN/inf with None so FastAPI serialises them as JSON null
        result = result.where(result.notna(), other=None)
        return result.to_dict(orient="records")
    finally:
        con.close()


MARKET_OPEN  = "09:30:00"
MARKET_CLOSE = "16:15:00"  # SPX options trade until 4:15 PM ET


def build_where(
    start: str | None,
    end: str | None,
    side: str | None,
    strike_min: float | None,
    strike_max: float | None,
    dte_min: float | None,
    dte_max: float | None,
) -> tuple[str, list[Any]]:
    """Build a WHERE clause and corresponding parameter list.

    Always restricts to regular market hours (9:30 AM – 4:15 PM ET).
    Timestamps in the Parquet file are US/Eastern so no tz conversion needed.
    """
    clauses: list[str] = [
        f"CAST(timestamp AS TIME) >= TIME '{MARKET_OPEN}'",
        f"CAST(timestamp AS TIME) <= TIME '{MARKET_CLOSE}'",
    ]
    params: list[Any] = []

    if start:
        clauses.append("timestamp >= ?")
        params.append(start)
    if end:
        clauses.append("timestamp <= ?")
        params.append(end)
    if side and side in ("Bid", "Ask"):
        clauses.append("Side = ?")
        params.append(side)
    if strike_min is not None:
        clauses.append("spx_strike >= ?")
        params.append(strike_min)
    if strike_max is not None:
        clauses.append("spx_strike <= ?")
        params.append(strike_max)
    if dte_min is not None:
        clauses.append("t >= ?")
        params.append(dte_min)
    if dte_max is not None:
        clauses.append("t <= ?")
        params.append(dte_max)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params
