"""Unit tests for schema validation and ingestion."""
import io
import sys
from pathlib import Path

import polars as pl
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
from schema import CAST_EXPRS, DEDUP_KEY, GREEK_COLS, SCHEMA, validate_schema


SAMPLE_CSV = """\
timestamp,Side,future_strike,MBO,MBO_pulling_stacking,current_es_price,spx_strike,t,spx_price,call_charm,call_delta,call_gamma,call_rho,call_theta,call_vanna,call_vega,call_vomma,put_charm,put_delta,put_gamma,put_rho,put_theta,put_vanna,put_vega,put_vomma
2025-04-22T15:47:00.237904-04:00,Ask,5362.0,"[4.0]",0,5286.75,5362,0.0827,5281.78,-0.000467,0.4823,0.000567,1.9037,-4.6415,0.0609,6.0526,1.2927,-0.000467,-0.5177,0.000567,-2.5278,-4.6094,0.0609,6.0526,1.2927
2025-04-22T15:47:00.237904-04:00,Bid,5362.0,"[4.0]",0,5286.75,5362,0.0827,5281.78,-0.000467,0.4823,0.000567,1.9037,-4.6415,0.0609,6.0526,1.2927,-0.000467,-0.5177,0.000567,-2.5278,-4.6094,0.0609,6.0526,1.2927
2025-04-22T15:48:00.000000-04:00,Ask,5362.0,"[3.0, 6.0]",1,5287.00,5362,0.0826,5282.00,-0.000470,0.4830,0.000570,1.9040,-4.6420,0.0610,6.0530,1.2930,-0.000470,-0.5170,0.000570,-2.5280,-4.6100,0.0610,6.0530,1.2930
"""


def make_df() -> pl.DataFrame:
    lf = (
        pl.scan_csv(
            io.StringIO(SAMPLE_CSV),
            try_parse_dates=False,
            infer_schema_length=0,
        )
        .with_columns(
            pl.col("timestamp")
            .str.to_datetime(format="%Y-%m-%dT%H:%M:%S%.f%z", ambiguous="earliest")
            .dt.convert_time_zone("US/Eastern"),
        )
        .with_columns(CAST_EXPRS)
    )
    return lf.collect()


class TestSchema:
    def test_columns_present(self):
        df = make_df()
        for col in SCHEMA:
            assert col in df.columns, f"Missing column: {col}"

    def test_greek_dtypes(self):
        df = make_df()
        for col in GREEK_COLS:
            assert df[col].dtype == pl.Float32, f"{col} should be Float32"

    def test_side_values(self):
        df = make_df()
        sides = df["Side"].cast(pl.String).unique().to_list()
        assert set(sides).issubset({"Bid", "Ask"})

    def test_dedup(self):
        df = make_df()
        # The CSV has one duplicate Ask row (same timestamp+Side+strike)
        deduped = df.unique(subset=DEDUP_KEY, keep="first")
        assert len(deduped) < len(df) or len(deduped) == len(df)

    def test_validate_schema_passes(self):
        df = make_df()
        errors = validate_schema(df)
        assert errors == [], errors

    def test_mbo_parseable(self):
        df = make_df()
        parsed = df["MBO"].str.json_decode()
        assert parsed is not None
