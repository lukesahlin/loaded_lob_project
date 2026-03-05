PYTHON = python
NODE = "C:/Program Files/nodejs/node.exe"
VITE = $(NODE) frontend/node_modules/vite/bin/vite.js
PARQUET = data/flow.parquet

.PHONY: install run api frontend export

# Install all dependencies
install:
	$(PYTHON) -m pip install polars pyarrow fastapi "uvicorn[standard]" duckdb
	$(NODE) "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" --prefix frontend install

# Generate static JSON from Parquet (for local static mode)
export:
	$(PYTHON) pipeline/export_static.py --parquet $(PARQUET) --out frontend/public/data

# Start the FastAPI backend
api:
	PARQUET_PATH=$(PARQUET) $(PYTHON) -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

# Start the Vite frontend dev server
frontend:
	$(VITE) --host

# Run everything: export static data then start frontend (no API needed)
run: export
	$(VITE) --host
