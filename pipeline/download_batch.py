"""
Batch downloader + ingester for pangeon-condor minute CSV.gz files.

Downloads files in parallel, then ingests them in bounded batches so memory
usage stays manageable (each minute file is ~182K rows; 400 files = ~73M rows).

URL pattern:
  https://storage.googleapis.com/pangeon-condor-data-v1/2025/04/{DD}/
      loaded_lob_20250414__20250414_{HHMM}.csv.gz

Usage (generate URLs from pattern — no file needed):
    python download_batch.py --dates 20250414 20250415 \\
        --dest ../data/raw --ingest --output ../data/flow.parquet

    # Custom time range per day (default: 0921-1600):
    python download_batch.py --dates 20250414 --start 0930 --end 1200 \\
        --dest ../data/raw --ingest --output ../data/flow.parquet

Usage (from a URL list file):
    python download_batch.py --urls ../data/urls.txt \\
        --dest ../data/raw --ingest --output ../data/flow.parquet
"""
import argparse
import gzip
import io
import logging
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import polars as pl

# Add parent so we can import schema
sys.path.insert(0, str(Path(__file__).parent))
from schema import CAST_EXPRS, DEDUP_KEY  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("download_batch")


# ── Download ──────────────────────────────────────────────────────────────────

def download_one(url: str, dest_dir: Path) -> tuple[str, Path | None]:
    fname = url.split("/")[-1]
    parts = fname.split("_")
    date_str = parts[2] if len(parts) > 2 else "unknown"
    day_dir = dest_dir / date_str
    day_dir.mkdir(parents=True, exist_ok=True)

    out_path = day_dir / fname
    if out_path.exists():
        return url, out_path

    try:
        urllib.request.urlretrieve(url, out_path)
        return url, out_path
    except Exception as exc:
        log.error("FAILED %s: %s", url, exc)
        return url, None


def download_all(urls: list[str], dest_dir: Path, workers: int) -> list[Path]:
    log.info("Downloading %d files with %d workers...", len(urls), workers)
    downloaded: list[Path] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(download_one, u, dest_dir): u for u in urls}
        done = 0
        for fut in as_completed(futures):
            url, path = fut.result()
            done += 1
            if path:
                downloaded.append(path)
                if done % 50 == 0 or done == len(urls):
                    log.info("  %d/%d complete", done, len(urls))
            else:
                log.warning("  Error downloading: %s", url)
    log.info("Downloaded %d files to %s", len(downloaded), dest_dir)
    return sorted(downloaded)


# ── Ingest (bounded batches) ──────────────────────────────────────────────────

def ingest_gz(path: Path) -> pl.DataFrame:
    # Files are double-gzipped; inner content is a single CSV-quoted JSON array:
    #   "[{\"timestamp\":\"...\", ...}, ...]"
    # Step 1: decompress outer gz
    with gzip.open(str(path), "rb") as f:
        inner_bytes = f.read()
    # Step 2: decompress inner gz
    with gzip.open(io.BytesIO(inner_bytes), "rt", encoding="utf-8") as f:
        line = f.read().strip()
    # Step 3: strip surrounding CSV quotes if present
    if line.startswith('"') and line.endswith('"'):
        line = line[1:-1].replace('\\"', '"')
    # Step 4: parse JSON array -> Polars DataFrame
    df = pl.read_json(io.StringIO(line))
    # MBO arrives as List(Float64) from JSON; serialize to String to match schema
    df = df.with_columns(
        pl.col("MBO").map_elements(lambda x: str(list(x)) if x is not None else "[]", return_dtype=pl.String)
    )
    df = (
        df
        .with_columns(
            pl.col("timestamp")
            .str.to_datetime(format="%Y-%m-%dT%H:%M:%S%.f%z", ambiguous="earliest")
            .dt.convert_time_zone("US/Eastern"),
        )
        .with_columns(CAST_EXPRS)
    )
    return df


def append_to_parquet(df: pl.DataFrame, output: Path) -> None:
    if output.exists():
        existing = pl.read_parquet(str(output))
        combined = pl.concat([existing, df]).unique(subset=DEDUP_KEY, keep="first")
        log.info(
            "  Merged: %d existing + %d new = %d unique rows",
            len(existing), len(df), len(combined),
        )
        combined.write_parquet(str(output), compression="snappy")
    else:
        df_dedup = df.unique(subset=DEDUP_KEY, keep="first")
        df_dedup.write_parquet(str(output), compression="snappy")
        log.info("  Created %s (%d rows)", output, len(df_dedup))


def ingest_batched(files: list[Path], output: Path, batch_size: int) -> None:
    total = len(files)
    log.info("Ingesting %d files in batches of %d -> %s", total, batch_size, output)

    for i in range(0, total, batch_size):
        batch = files[i : i + batch_size]
        log.info("Batch %d-%d / %d", i + 1, min(i + batch_size, total), total)

        frames: list[pl.DataFrame] = []
        for p in batch:
            try:
                df = ingest_gz(p)
                frames.append(df)
                log.info("  %s  (%d rows)", p.name, len(df))
            except Exception as exc:
                log.error("  SKIP %s: %s", p.name, exc)

        if frames:
            combined = pl.concat(frames)
            append_to_parquet(combined, output)
            del frames, combined  # free memory before next batch

    log.info("Ingest complete: %s", output)


# ── URL generation from pattern ───────────────────────────────────────────────

BASE = "https://storage.googleapis.com/pangeon-condor-data-v1"

def generate_urls(dates: list[str], start: str, end: str) -> list[str]:
    """Generate minute-by-minute URLs for each date between start and end (HHMM)."""
    urls = []
    start_h, start_m = int(start[:2]), int(start[2:])
    end_h, end_m = int(end[:2]), int(end[2:])

    for date in dates:
        year, month, day = date[:4], date[4:6], date[6:8]
        h, m = start_h, start_m
        while (h, m) <= (end_h, end_m):
            hhmm = f"{h:02d}{m:02d}"
            fname = f"loaded_lob_{date}__{date}_{hhmm}.csv.gz"
            url = f"{BASE}/{year}/{month}/{day}/{fname}"
            urls.append(url)
            m += 1
            if m == 60:
                m = 0
                h += 1
    return urls


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser()
    # Source: either a URL file or date pattern
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--urls", help="Text file with one URL per line")
    src.add_argument("--dates", nargs="+", help="Date(s) to download, e.g. 20250414 20250415")

    parser.add_argument("--start", default="0921", help="Start time HHMM (default: 0921)")
    parser.add_argument("--end",   default="1600", help="End time HHMM (default: 1600)")
    parser.add_argument("--dest", default="../data/raw", help="Destination for downloaded files")
    parser.add_argument("--workers", type=int, default=16, help="Parallel download threads")
    parser.add_argument("--ingest", action="store_true", help="Ingest downloaded files into Parquet")
    parser.add_argument("--output", default="../data/flow.parquet", help="Output Parquet path")
    parser.add_argument("--batch-size", type=int, default=50, help="Files per ingest batch")
    args = parser.parse_args()

    if args.urls:
        url_file = Path(args.urls)
        if not url_file.exists():
            log.error("URL file not found: %s", args.urls)
            sys.exit(1)
        urls = [u.strip() for u in url_file.read_text().splitlines() if u.strip() and not u.startswith("#")]
    else:
        urls = generate_urls(args.dates, args.start, args.end)

    log.info("Generated %d URLs", len(urls))

    dest = Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)

    files = download_all(urls, dest, args.workers)

    if args.ingest and files:
        ingest_batched(files, Path(args.output), args.batch_size)


if __name__ == "__main__":
    main()
