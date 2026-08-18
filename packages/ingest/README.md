# Ingestion framework

Raw runs are immutable under `raw/{source}/{yyyy-mm-dd}/{run_id}/` and include a
`manifest.json`. Conformed Parquet is written to
`conformed/{source}/{period}/{dataset}.parquet`. SQL transforms and adjacent
`*.metadata.json` files are versioned together; lineage uses the SHA-256 of the
declared version plus SQL bytes.

`publishConformed` opens one outer database transaction, calls the owning
domain's exposed ingest function with that transaction, then inserts lineage.
It never writes another domain's table directly. The generic fixture is
classified as `TEMPLATE`; `FEED` is reserved for automated adapters.
