SELECT row_number() OVER () + 1 AS row_number,
       trim(CAST(period AS VARCHAR)) AS period,
       try_cast(value AS DOUBLE) AS value,
       CASE
         WHEN trim(CAST(period AS VARCHAR)) = '' OR try_cast(value AS DOUBLE) IS NULL THEN 'rejected'
         WHEN trim(CAST(period AS VARCHAR)) <> {{expected_period}} THEN 'rejected'
         WHEN {{sd}} > 0 AND abs(try_cast(value AS DOUBLE) - {{mean}}) > 3 * {{sd}} THEN 'warning'
         ELSE 'accepted'
       END AS outcome,
       CASE
         WHEN trim(CAST(period AS VARCHAR)) = '' OR try_cast(value AS DOUBLE) IS NULL THEN 'period and numeric value are required'
         WHEN trim(CAST(period AS VARCHAR)) <> {{expected_period}} THEN 'Expected period ' || {{expected_period}}
         WHEN {{sd}} > 0 AND abs(try_cast(value AS DOUBLE) - {{mean}}) > 3 * {{sd}} THEN 'Value exceeds 3 standard deviations from trailing history'
         ELSE NULL
       END AS reason,
       outcome <> 'rejected' AS passed
FROM read_csv_auto({{raw_csv}}, header = true);
