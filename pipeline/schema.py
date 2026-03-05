"""
Dtype definitions and validators for the Options Flow MBO dataset.
"""
import polars as pl

# ── Target Parquet Schema ──────────────────────────────────────────────────
SCHEMA: dict[str, pl.DataType] = {
    "timestamp":            pl.Datetime("us", "US/Eastern"),
    "Side":                 pl.Categorical,
    "future_strike":        pl.Float32,
    "MBO":                  pl.String,
    "MBO_pulling_stacking": pl.Int16,
    "current_es_price":     pl.Float32,
    "spx_strike":           pl.Int32,
    "t":                    pl.Float32,
    "spx_price":            pl.Float32,
    # Call greeks
    "call_charm":  pl.Float32,
    "call_delta":  pl.Float32,
    "call_gamma":  pl.Float32,
    "call_rho":    pl.Float32,
    "call_theta":  pl.Float32,
    "call_vanna":  pl.Float32,
    "call_vega":   pl.Float32,
    "call_vomma":  pl.Float32,
    # Put greeks
    "put_charm":  pl.Float32,
    "put_delta":  pl.Float32,
    "put_gamma":  pl.Float32,
    "put_rho":    pl.Float32,
    "put_theta":  pl.Float32,
    "put_vanna":  pl.Float32,
    "put_vega":   pl.Float32,
    "put_vomma":  pl.Float32,
}

DEDUP_KEY = ["timestamp", "Side", "future_strike"]

GREEK_COLS = [
    "call_charm", "call_delta", "call_gamma", "call_rho",
    "call_theta", "call_vanna", "call_vega", "call_vomma",
    "put_charm",  "put_delta",  "put_gamma",  "put_rho",
    "put_theta",  "put_vanna",  "put_vega",   "put_vomma",
]

# Cast expressions applied after scan_csv
CAST_EXPRS = [
    pl.col("Side").cast(pl.Categorical),
    pl.col("future_strike").cast(pl.Float32),
    pl.col("MBO").cast(pl.String),
    pl.col("MBO_pulling_stacking").cast(pl.Int16),
    pl.col("current_es_price").cast(pl.Float32),
    pl.col("spx_strike").cast(pl.Int32),
    pl.col("t").cast(pl.Float32),
    pl.col("spx_price").cast(pl.Float32),
] + [pl.col(c).cast(pl.Float32) for c in GREEK_COLS]


def validate_schema(df: pl.DataFrame) -> list[str]:
    """Return list of validation error messages (empty = OK)."""
    errors: list[str] = []
    for col, expected in SCHEMA.items():
        if col not in df.columns:
            errors.append(f"Missing column: {col}")
            continue
        actual = df[col].dtype
        # Loose check: Categorical OK for Side
        if col == "Side":
            continue
        if col == "timestamp":
            if not isinstance(actual, pl.Datetime):
                errors.append(f"{col}: expected Datetime, got {actual}")
            continue
        if actual != expected:
            errors.append(f"{col}: expected {expected}, got {actual}")
    if "Side" in df.columns:
        bad = df.filter(~pl.col("Side").cast(pl.String).is_in(["Bid", "Ask"]))
        if len(bad) > 0:
            errors.append(f"Side has unexpected values: {bad['Side'].unique().to_list()}")
    return errors
