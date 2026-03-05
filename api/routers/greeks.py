"""
Greeks-related endpoints:
  /greeks/surface      — 3D surface: (spx_strike × t × selected greek)
  /greeks/vanna_charm  — Vanna/Charm exposure bar chart by strike
  /greeks/theta        — Theta decay curves by strike
  /greeks/scatter      — Vomma vs Vega scatter
  /greeks/correlation  — Cross-greek correlation matrix
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from api.db import build_where, parquet_ref, query

GREEK_COLS_LIST = [
    "call_charm", "call_delta", "call_gamma", "call_rho",
    "call_theta", "call_vanna", "call_vega", "call_vomma",
    "put_charm",  "put_delta",  "put_gamma",  "put_rho",
    "put_theta",  "put_vanna",  "put_vega",   "put_vomma",
]

router = APIRouter(prefix="/greeks", tags=["greeks"])


@router.get("/surface")
def surface(
    greek: str = Query("call_vega", description="Greek column name"),
    start: str | None = None,
    end: str | None = None,
    limit: int = Query(5000, ge=1, le=50000),
):
    """Return (spx_strike, t, avg_greek) for 3D surface rendering."""
    if greek not in GREEK_COLS_LIST:
        return {"error": f"Unknown greek: {greek}. Valid: {GREEK_COLS_LIST}"}
    where, params = build_where(start, end, None, None, None, None, None)
    tbl = parquet_ref()
    sql = f"""
        SELECT
            spx_strike,
            ROUND(t, 4)     AS t,
            AVG({greek})    AS greek_value
        FROM {tbl}
        {where}
        GROUP BY spx_strike, ROUND(t, 4)
        ORDER BY spx_strike, t
        LIMIT {limit}
    """
    return query(sql, params)


@router.get("/vanna_charm")
def vanna_charm(
    metric: str = Query("vanna", description="'vanna' or 'charm'"),
    start: str | None = None,
    end: str | None = None,
    strike_min: float | None = None,
    strike_max: float | None = None,
    limit: int = Query(1000, ge=1, le=10000),
):
    """Grouped bar: call and put vanna (or charm) per strike."""
    if metric == "vanna":
        call_col, put_col = "call_vanna", "put_vanna"
    elif metric == "charm":
        call_col, put_col = "call_charm", "put_charm"
    else:
        return {"error": "metric must be 'vanna' or 'charm'"}

    where, params = build_where(start, end, None, strike_min, strike_max, None, None)
    tbl = parquet_ref()
    sql = f"""
        SELECT
            spx_strike,
            AVG({call_col}) AS call_value,
            AVG({put_col})  AS put_value
        FROM {tbl}
        {where}
        GROUP BY spx_strike
        ORDER BY spx_strike
        LIMIT {limit}
    """
    return query(sql, params)


@router.get("/theta")
def theta(
    start: str | None = None,
    end: str | None = None,
    strike_min: float | None = None,
    strike_max: float | None = None,
    limit: int = Query(5000, ge=1, le=50000),
):
    """Theta decay curves: (t, spx_strike, call_theta, put_theta)."""
    where, params = build_where(start, end, None, strike_min, strike_max, None, None)
    tbl = parquet_ref()
    sql = f"""
        SELECT
            spx_strike,
            ROUND(t, 4) AS t,
            AVG(call_theta) AS call_theta,
            AVG(put_theta)  AS put_theta
        FROM {tbl}
        {where}
        GROUP BY spx_strike, ROUND(t, 4)
        ORDER BY spx_strike, t
        LIMIT {limit}
    """
    return query(sql, params)


@router.get("/scatter")
def scatter(
    start: str | None = None,
    end: str | None = None,
    limit: int = Query(5000, ge=1, le=50000),
):
    """Vomma vs Vega scatter with strike color and MBO count as size."""
    where, params = build_where(start, end, None, None, None, None, None)
    tbl = parquet_ref()
    sql = f"""
        SELECT
            spx_strike,
            AVG(call_vega)  AS call_vega,
            AVG(call_vomma) AS call_vomma,
            COUNT(*)        AS mbo_count
        FROM {tbl}
        {where}
        GROUP BY spx_strike
        ORDER BY spx_strike
        LIMIT {limit}
    """
    return query(sql, params)


@router.get("/correlation")
def correlation(
    start: str | None = None,
    end: str | None = None,
    limit: int = Query(50000, ge=1, le=500000),
):
    """Return raw greek values for client-side Pearson correlation matrix."""
    where, params = build_where(start, end, None, None, None, None, None)
    tbl = parquet_ref()
    cols = ", ".join(GREEK_COLS_LIST)
    sql = f"""
        SELECT {cols}
        FROM {tbl}
        {where}
        LIMIT {limit}
    """
    rows = query(sql, params)
    # Compute pairwise Pearson on server side
    import statistics

    if not rows:
        return {"columns": GREEK_COLS_LIST, "matrix": []}

    vectors: dict[str, list[float]] = {c: [] for c in GREEK_COLS_LIST}
    for row in rows:
        for c in GREEK_COLS_LIST:
            v = row.get(c)
            vectors[c].append(float(v) if v is not None else 0.0)

    n = len(GREEK_COLS_LIST)
    matrix: list[list[float]] = []
    for i, ci in enumerate(GREEK_COLS_LIST):
        row_corr: list[float] = []
        for j, cj in enumerate(GREEK_COLS_LIST):
            if i == j:
                row_corr.append(1.0)
            else:
                try:
                    r = statistics.correlation(vectors[ci], vectors[cj])
                except Exception:
                    r = 0.0
                row_corr.append(round(r, 4))
        matrix.append(row_corr)

    return {"columns": GREEK_COLS_LIST, "matrix": matrix}
