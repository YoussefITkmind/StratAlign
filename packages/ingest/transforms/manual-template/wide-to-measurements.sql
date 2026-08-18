COPY (
  UNPIVOT read_csv_auto({{raw_csv}}, header = true)
  ON COLUMNS(* EXCLUDE (kpi_version_id, scope_node_id, submitted_by, sector))
  INTO NAME period VALUE value
) TO {{conformed_parquet}} (FORMAT PARQUET);
