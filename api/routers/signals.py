"""
Microstructure signal endpoints:
  /signals/pulling_stacking  — Pulling/stacking events on price
  /signals/net_flow          — Delta-adjusted net flow over time
  /signals/basis             — ES vs SPX basis
  /signals/kpi               — Dashboard KPI row
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from api.db import build_where, parquet_ref, query

router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("/pulling_stacking")
def pulling_stacking(
    start: str | None = None,
    end: str | None = None,
    limit: int = Query(10000, ge=1, le=100000),
):
    """Return events where MBO_pulling_stacking != 0 overlaid on spx_price."""
    where, params = build_where(start, end, None, None, None, None, None)
    tbl = parquet_ref()
    sql = f"""
        SELECT
            timestamp,
            spx_price,
            MBO_pulling_stacking
        FROM {tbl}
        {where}
        ORDER BY timestamp
        LIMIT {limit}
    """
    return query(sql, params)


@router.get("/net_flow")
def net_flow(
    start: str | None = None,
    end: str | None = None,
    bucket_minutes: int = Query(1, ge=1, le=60),
    limit: int = Query(5000, ge=1, le=50000),
):
    """
    Delta-adjusted net flow per time bucket.
    net_delta = sum(call_delta × mbo_size) - sum(put_delta × mbo_size)
    """
    where, params = build_where(start, end, None, None, None, None, None)
    tbl = parquet_ref()
    sql = f"""
        WITH sized AS (
            SELECT
                time_bucket(INTERVAL '{bucket_minutes} minutes', timestamp) AS tb,
                call_delta,
                put_delta,
                list_aggregate(json_extract(MBO, '$[*]')::DOUBLE[], 'sum') AS mbo_size
            FROM {tbl}
            {where}
        )
        SELECT
            tb AS time_bucket,
            SUM(call_delta * mbo_size)  AS call_delta_flow,
            SUM(-put_delta * mbo_size)  AS put_delta_flow,
            SUM((call_delta - put_delta) * mbo_size) AS net_delta
        FROM sized
        GROUP BY tb
        ORDER BY tb
        LIMIT {limit}
    """
    return query(sql, params)


@router.get("/basis")
def basis(
    start: str | None = None,
    end: str | None = None,
    bucket_minutes: int = Query(1, ge=1, le=60),
    limit: int = Query(5000, ge=1, le=50000),
):
    """ES vs SPX basis: basis = ES_price - SPX_price per time bucket."""
    where, params = build_where(start, end, None, None, None, None, None)
    tbl = parquet_ref()
    sql = f"""
        SELECT
            time_bucket(INTERVAL '{bucket_minutes} minutes', timestamp) AS time_bucket,
            AVG(current_es_price / 100.0) AS es_price,
            AVG(spx_price)                AS spx_price,
            AVG(current_es_price / 100.0 - spx_price) AS basis
        FROM {tbl}
        {where}
        GROUP BY time_bucket(INTERVAL '{bucket_minutes} minutes', timestamp)
        ORDER BY time_bucket
        LIMIT {limit}
    """
    return query(sql, params)


@router.get("/kpi")
def kpi(
    start: str | None = None,
    end: str | None = None,
):
    """Dashboard KPI summary: total events, unique strikes, date range, avg spread."""
    where, params = build_where(start, end, None, None, None, None, None)
    tbl = parquet_ref()
    sql = f"""
        SELECT
            COUNT(*)                       AS total_events,
            COUNT(DISTINCT spx_strike)     AS unique_strikes,
            MIN(timestamp)                 AS start_date,
            MAX(timestamp)                 AS end_date,
            COUNT(DISTINCT future_strike)  AS unique_es_strikes,
            AVG(spx_price)                 AS avg_spx_price,
            SUM(CASE WHEN MBO_pulling_stacking != 0 THEN 1 ELSE 0 END) AS total_ps_events
        FROM {tbl}
        {where}
    """
    rows = query(sql, params)
    return rows[0] if rows else {}
