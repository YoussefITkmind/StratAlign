COPY (
  SELECT kpi_version_id, scope_node_id, period, CAST(value AS DECIMAL(20,6)) AS value,
         'TEMPLATE' AS source, submitted_by, source_object, source_field
  FROM read_csv_auto({{raw_csv}}, header = true)
) TO {{conformed_parquet}} (FORMAT PARQUET);
