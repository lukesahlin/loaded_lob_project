"""
Options Flow MBO Ingestion Script
----------------------------------
Converts one or more CSV files into a single append-safe Parquet store.

Usage:
    python ingest.py --input "data/raw/*.csv" --output "data/flow.parquet"
    python ingest.py --input "data/raw/file1.csv" "data/raw/file2.csv" --output "data/flow.parquet"
    python ingest.py --input "data/raw/*.csv" --output "data/flow/" --partition
"""
import argparse
import glob
import logging
import os
import sys
from pathlib import Path

import polars as pl

from schema import CAST_EXPRS, DEDUP_KEY, validate_schema

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ingest")

PROCESSED_LOG = "processed_files.log"


def load_processed(log_path: str) -> set[str]:
    p = Path(log_path)
    if not p.exists():
        return set()
    return set(p.read_text().splitlines())


def mark_processed(log_path: str, path: str) -> None:
    with open(log_path, "a") as f:
        f.write(path + "\n")


def resolve_inputs(patterns: list[str]) -> list[str]:
    paths: list[str] = []
    for pat in patterns:
        expanded = glob.glob(pat, recursive=True)
        if expanded:
            paths.extend(expanded)
        elif os.path.exists(pat):
            paths.append(pat)
        else:
            log.warning("No files matched: %s", pat)
    return sorted(set(paths))


def ingest_csv(path: str) -> pl.DataFrame:
    log.info("Scanning %s", path)
    lf = (
        pl.scan_csv(
            path,
            try_parse_dates=False,
            infer_schema_length=0,  # all strings initially
        )
        .with_columns(
            pl.col("timestamp")
            .str.to_datetime(format="%Y-%m-%dT%H:%M:%S%.f%z", ambiguous="earliest")
            .dt.convert_time_zone("US/Eastern"),
        )
        .with_columns(CAST_EXPRS)
    )
    df = lf.collect()
    log.info("  Loaded %d rows", len(df))
    return df


def append_parquet(df: pl.DataFrame, output: str, partition: bool) -> None:
    out_path = Path(output)

    if partition:
        # Hive partitioning by date
        df = df.with_columns(
            pl.col("timestamp").dt.date().alias("date")
        )
        df.write_parquet(
            str(out_path),
            use_pyarrow=True,
            partition_by=["date"],
        )
        log.info("Written partitioned Parquet -> %s", output)
        return

    if out_path.exists():
        existing = pl.read_parquet(str(out_path))
        combined = pl.concat([existing, df]).unique(subset=DEDUP_KEY, keep="first")
        log.info(
            "Merged: %d existing + %d new = %d unique rows",
            len(existing), len(df), len(combined),
        )
        combined.write_parquet(str(out_path), compression="snappy")
    else:
        df_dedup = df.unique(subset=DEDUP_KEY, keep="first")
        df_dedup.write_parquet(str(out_path), compression="snappy")
        log.info("Created %s with %d rows", output, len(df_dedup))


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest MBO CSV files into Parquet")
    parser.add_argument(
        "--input", nargs="+", required=True,
        help="Glob pattern(s) or file path(s) to ingest",
    )
    parser.add_argument(
        "--output", default="data/flow.parquet",
        help="Output Parquet file or directory (for --partition)",
    )
    parser.add_argument(
        "--partition", action="store_true",
        help="Use Polars hive partitioning (partition_by=date)",
    )
    parser.add_argument(
        "--skip-processed", action="store_true", default=True,
        help="Skip files already listed in processed_files.log",
    )
    parser.add_argument(
        "--validate", action="store_true",
        help="Run schema validation and abort on errors",
    )
    args = parser.parse_args()

    processed = load_processed(PROCESSED_LOG) if args.skip_processed else set()
    paths = resolve_inputs(args.input)

    if not paths:
        log.error("No input files found. Check your --input pattern.")
        sys.exit(1)

    all_frames: list[pl.DataFrame] = []
    for path in paths:
        abs_path = os.path.abspath(path)
        if abs_path in processed:
            log.info("Skipping (already processed): %s", path)
            continue
        df = ingest_csv(path)

        if args.validate:
            errs = validate_schema(df)
            if errs:
                log.error("Schema validation failed for %s:", path)
                for e in errs:
                    log.error("  %s", e)
                sys.exit(1)

        all_frames.append(df)
        mark_processed(PROCESSED_LOG, abs_path)

    if not all_frames:
        log.info("Nothing new to ingest.")
        return

    combined = pl.concat(all_frames)
    log.info("Total rows to write: %d", len(combined))
    append_parquet(combined, args.output, args.partition)
    log.info("Done.")


if __name__ == "__main__":
    main()
