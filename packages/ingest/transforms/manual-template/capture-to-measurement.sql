COPY (
  SELECT {{kpi_version_id}} AS kpi_version_id, {{scope_node_id}} AS scope_node_id,
         trim(CAST(period AS VARCHAR)) AS period, try_cast(value AS DOUBLE) AS value,
         'TEMPLATE' AS source, {{submitted_by}} AS submitted_by
  FROM read_csv_auto({{raw_csv}}, header = true)
) TO {{conformed_parquet}} (FORMAT PARQUET);
