"""
Static JSON export for GitHub Pages deployment.
Runs all DuckDB queries with default parameters and writes results to
frontend/public/data/ so the frontend can load them without a live API.

Usage:
    python pipeline/export_static.py
    python pipeline/export_static.py --parquet data/flow.parquet --out frontend/public/data
"""
import argparse
import json
import os
import statistics
import sys
from pathlib import Path

import duckdb

BUCKET_SECONDS = 5

GREEK_COLS = [
    "call_charm", "call_delta", "call_gamma", "call_rho",
    "call_theta", "call_vanna", "call_vega", "call_vomma",
    "put_charm",  "put_delta",  "put_gamma",  "put_rho",
    "put_theta",  "put_vanna",  "put_vega",   "put_vomma",
]

GREEK_SURFACE_OPTIONS = [
    "call_vega", "call_gamma", "call_vanna", "call_delta",
    "call_theta", "call_vomma", "call_charm", "call_rho",
]


def tbl(parquet_path: str) -> str:
    return f"read_parquet('{parquet_path}')"


def run(con: duckdb.DuckDBPyConnection, sql: str) -> list[dict]:
    return con.execute(sql).fetchdf().to_dict(orient="records")


def write(out_dir: Path, name: str, data: object) -> None:
    path = out_dir / f"{name}.json"
    path.write_text(json.dumps(data, default=str), encoding="utf-8")
    size = path.stat().st_size
    print(f"  {name}.json  ({size // 1024} KB, {len(data) if isinstance(data, list) else 1} records)")


def export_all(parquet_path: str, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    t = tbl(parquet_path)
    con = duckdb.connect(":memory:")

    print("Exporting signals...")

    # kpi
    write(out_dir, "kpi", run(con, f"""
        SELECT
            COUNT(*)                       AS total_events,
            COUNT(DISTINCT spx_strike)     AS unique_strikes,
            MIN(timestamp)                 AS start_date,
            MAX(timestamp)                 AS end_date,
            COUNT(DISTINCT future_strike)  AS unique_es_strikes,
            AVG(spx_price)                 AS avg_spx_price,
            SUM(CASE WHEN MBO_pulling_stacking != 0 THEN 1 ELSE 0 END) AS total_ps_events
        FROM {t}
    """)[0])

    # basis
    write(out_dir, "basis", run(con, f"""
        SELECT
            time_bucket(INTERVAL '{BUCKET_SECONDS} seconds', timestamp::TIMESTAMPTZ) AS time_bucket,
            AVG(current_es_price / 100.0) AS es_price,
            AVG(spx_price)                AS spx_price,
            AVG(current_es_price / 100.0 - spx_price) AS basis
        FROM {t}
        GROUP BY 1 ORDER BY 1
    """))

    # pulling_stacking
    write(out_dir, "pulling_stacking", run(con, f"""
        SELECT timestamp, spx_price, MBO_pulling_stacking
        FROM {t} ORDER BY timestamp LIMIT 10000
    """))

    # net_flow
    write(out_dir, "net_flow", run(con, f"""
        WITH sized AS (
            SELECT
                time_bucket(INTERVAL '{BUCKET_SECONDS} seconds', timestamp::TIMESTAMPTZ) AS tb,
                call_delta, put_delta,
                list_aggregate(json_extract(MBO, '$[*]')::DOUBLE[], 'sum') AS mbo_size
            FROM {t}
        )
        SELECT
            tb AS time_bucket,
            SUM(call_delta * mbo_size)               AS call_delta_flow,
            SUM(-put_delta * mbo_size)               AS put_delta_flow,
            SUM((call_delta - put_delta) * mbo_size) AS net_delta
        FROM sized GROUP BY tb ORDER BY tb
    """))

    print("Exporting volume...")

    # heatmap
    write(out_dir, "heatmap", run(con, f"""
        WITH parsed AS (
            SELECT
                time_bucket(INTERVAL '{BUCKET_SECONDS} seconds', timestamp::TIMESTAMPTZ) AS time_bucket,
                future_strike,
                list_aggregate(json_extract(MBO, '$[*]')::DOUBLE[], 'sum') AS mbo_sum
            FROM {t}
        )
        SELECT time_bucket, future_strike, SUM(mbo_sum) AS total_size
        FROM parsed GROUP BY time_bucket, future_strike
        ORDER BY time_bucket, future_strike LIMIT 5000
    """))

    # histogram
    write(out_dir, "histogram", run(con, f"""
        SELECT unnest(json_extract(MBO, '$[*]')::DOUBLE[]) AS mbo_value
        FROM {t} LIMIT 10000
    """))

    # spread
    write(out_dir, "spread", run(con, f"""
        WITH b AS (
            SELECT time_bucket(INTERVAL '{BUCKET_SECONDS} seconds', timestamp::TIMESTAMPTZ) AS tb,
                   Side, AVG(future_strike) AS avg_strike, AVG(spx_price) AS avg_spx_price
            FROM {t} GROUP BY tb, Side
        ),
        ask AS (SELECT tb, avg_strike AS ask_strike, avg_spx_price FROM b WHERE Side='Ask'),
        bid AS (SELECT tb, avg_strike AS bid_strike FROM b WHERE Side='Bid')
        SELECT ask.tb AS time_bucket, ask.ask_strike - bid.bid_strike AS spread, ask.avg_spx_price AS spx_price
        FROM ask JOIN bid ON ask.tb = bid.tb ORDER BY ask.tb
    """))

    # depth
    write(out_dir, "depth", run(con, f"""
        SELECT future_strike, Side, COUNT(*) AS event_count,
               SUM(list_aggregate(json_extract(MBO, '$[*]')::DOUBLE[], 'sum')) AS total_size
        FROM {t} GROUP BY future_strike, Side ORDER BY future_strike, Side LIMIT 2000
    """))

    print("Exporting greeks...")

    # greeks surface — one file per greek
    for greek in GREEK_SURFACE_OPTIONS:
        write(out_dir, f"surface_{greek}", run(con, f"""
            SELECT spx_strike, ROUND(t, 4) AS t, AVG({greek}) AS greek_value
            FROM {t} GROUP BY spx_strike, ROUND(t, 4)
            ORDER BY spx_strike, t LIMIT 5000
        """))

    # vanna_charm
    for metric, call_col, put_col in [("vanna", "call_vanna", "put_vanna"), ("charm", "call_charm", "put_charm")]:
        write(out_dir, f"vanna_charm_{metric}", run(con, f"""
            SELECT spx_strike, AVG({call_col}) AS call_value, AVG({put_col}) AS put_value
            FROM {t} GROUP BY spx_strike ORDER BY spx_strike LIMIT 1000
        """))

    # theta
    write(out_dir, "theta", run(con, f"""
        SELECT spx_strike, ROUND(t, 4) AS t, AVG(call_theta) AS call_theta, AVG(put_theta) AS put_theta
        FROM {t} GROUP BY spx_strike, ROUND(t, 4)
        ORDER BY spx_strike, t LIMIT 5000
    """))

    # scatter
    write(out_dir, "scatter", run(con, f"""
        SELECT spx_strike, AVG(call_vega) AS call_vega, AVG(call_vomma) AS call_vomma, COUNT(*) AS mbo_count
        FROM {t} GROUP BY spx_strike ORDER BY spx_strike LIMIT 5000
    """))

    # correlation matrix
    print("Exporting correlation matrix (may take a moment)...")
    cols_sql = ", ".join(GREEK_COLS)
    rows = run(con, f"SELECT {cols_sql} FROM {t} LIMIT 50000")
    vectors = {c: [float(r[c]) if r[c] is not None else 0.0 for r in rows] for c in GREEK_COLS}
    n = len(GREEK_COLS)
    matrix = []
    for i, ci in enumerate(GREEK_COLS):
        row = []
        for j, cj in enumerate(GREEK_COLS):
            if i == j:
                row.append(1.0)
            else:
                try:
                    row.append(round(statistics.correlation(vectors[ci], vectors[cj]), 4))
                except Exception:
                    row.append(0.0)
        matrix.append(row)
    write(out_dir, "correlation", {"columns": GREEK_COLS, "matrix": matrix})

    con.close()
    print(f"\nDone — {len(list(out_dir.glob('*.json')))} files written to {out_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export static JSON for GitHub Pages")
    parser.add_argument("--parquet", default="data/flow.parquet")
    parser.add_argument("--out",     default="frontend/public/data")
    args = parser.parse_args()

    parquet = args.parquet
    if not Path(parquet).exists():
        print(f"ERROR: Parquet not found at {parquet}", file=sys.stderr)
        sys.exit(1)

    print(f"Reading: {parquet}")
    export_all(parquet, Path(args.out))


if __name__ == "__main__":
    main()
