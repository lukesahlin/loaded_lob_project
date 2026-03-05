"""
Volume-related endpoints:
  /volume/heatmap      — 2D heatmap data (time bucket × strike × MBO sum)
  /volume/histogram    — MBO order size histogram (exploded values)
  /volume/spread       — Bid-ask spread vs price over time
  /volume/depth        — Order book depth waterfall by strike
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from api.db import build_where, parquet_ref, query

router = APIRouter(prefix="/volume", tags=["volume"])


@router.get("/heatmap")
def heatmap(
    start: str | None = None,
    end: str | None = None,
    side: str | None = None,
    bucket_minutes: int = Query(1, ge=1, le=60),
    limit: int = Query(5000, ge=1, le=50000),
):
    """
    Aggregate MBO order sizes into (time_bucket, future_strike) cells.
    MBO values are parsed from JSON array strings and summed.
    """
    where, params = build_where(start, end, side, None, None, None, None)
    tbl = parquet_ref()
    sql = f"""
        WITH parsed AS (
            SELECT
                time_bucket(INTERVAL '{bucket_minutes} minutes', timestamp) AS time_bucket,
                future_strike,
                -- sum the array elements: json_extract returns list, list_aggregate sums it
                list_aggregate(
                    json_extract(MBO, '$[*]')::DOUBLE[],
                    'sum'
                ) AS mbo_sum
            FROM {tbl}
            {where}
        )
        SELECT
            time_bucket,
            future_strike,
            SUM(mbo_sum) AS total_size
        FROM parsed
        GROUP BY time_bucket, future_strike
        ORDER BY time_bucket, future_strike
        LIMIT {limit}
    """
    return query(sql, params)


@router.get("/histogram")
def histogram(
    start: str | None = None,
    end: str | None = None,
    bins: int = Query(50, ge=5, le=200),
    limit: int = Query(10000, ge=1, le=100000),
):
    """Return exploded individual MBO values for log-scale histogram."""
    where, params = build_where(start, end, None, None, None, None, None)
    tbl = parquet_ref()
    sql = f"""
        SELECT unnest(json_extract(MBO, '$[*]')::DOUBLE[]) AS mbo_value
        FROM {tbl}
        {where}
        LIMIT {limit}
    """
    return query(sql, params)


@router.get("/spread")
def spread(
    start: str | None = None,
    end: str | None = None,
    bucket_minutes: int = Query(1, ge=1, le=60),
    limit: int = Query(5000, ge=1, le=50000),
):
    """
    Compute bid-ask spread (Ask price − Bid price) and SPX price per time bucket.
    Spread is approximated as the difference between avg ask future_strike and avg bid future_strike.
    """
    where, params = build_where(start, end, None, None, None, None, None)
    tbl = parquet_ref()
    sql = f"""
        WITH bucketed AS (
            SELECT
                time_bucket(INTERVAL '{bucket_minutes} minutes', timestamp) AS tb,
                Side,
                AVG(future_strike) AS avg_strike,
                AVG(spx_price)     AS avg_spx_price
            FROM {tbl}
            {where}
            GROUP BY tb, Side
        ),
        ask AS (SELECT tb, avg_strike AS ask_strike, avg_spx_price FROM bucketed WHERE Side = 'Ask'),
        bid AS (SELECT tb, avg_strike AS bid_strike FROM bucketed WHERE Side = 'Bid')
        SELECT
            ask.tb AS time_bucket,
            ask.ask_strike - bid.bid_strike AS spread,
            ask.avg_spx_price AS spx_price
        FROM ask JOIN bid ON ask.tb = bid.tb
        ORDER BY ask.tb
        LIMIT {limit}
    """
    return query(sql, params)


@router.get("/depth")
def depth(
    start: str | None = None,
    end: str | None = None,
    strike_min: float | None = None,
    strike_max: float | None = None,
    limit: int = Query(2000, ge=1, le=20000),
):
    """Order book depth: total MBO size per (future_strike, Side)."""
    where, params = build_where(start, end, None, strike_min, strike_max, None, None)
    tbl = parquet_ref()
    sql = f"""
        SELECT
            future_strike,
            Side,
            COUNT(*) AS event_count,
            SUM(list_aggregate(json_extract(MBO, '$[*]')::DOUBLE[], 'sum')) AS total_size
        FROM {tbl}
        {where}
        GROUP BY future_strike, Side
        ORDER BY future_strike, Side
        LIMIT {limit}
    """
    return query(sql, params)
