import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import type { RawManifest, TransformMetadata } from "./types";

const segment = (value: string, name: string) => {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error(`Invalid ${name}`);
  return value;
};

export function rawRunPath(source: string, extractionDate: string, runId: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(extractionDate)) throw new Error("Invalid extraction date");
  return `raw/${segment(source, "source")}/${extractionDate}/${segment(runId, "run id")}`;
}

export function conformedDatasetPath(source: string, period: string, dataset: string): string {
  return `conformed/${segment(source, "source")}/${segment(period, "period")}/${segment(dataset, "dataset")}.parquet`;
}

export async function getTransformationId(sqlFilePath: string): Promise<string> {
  const sql = await readFile(sqlFilePath);
  const metadata = await readTransformMetadata(sqlFilePath);
  return createHash("sha256").update(metadata.version).update("\0").update(sql).digest("hex");
}

export async function readTransformMetadata(sqlFilePath: string): Promise<TransformMetadata> {
  const metadataPath = join(dirname(sqlFilePath), `${sqlFilePath.slice(dirname(sqlFilePath).length + 1, -extname(sqlFilePath).length)}.metadata.json`);
  const value = JSON.parse(await readFile(metadataPath, "utf8")) as TransformMetadata;
  if (!value.version || !value.description || !Array.isArray(value.expectedOutputColumns)) throw new Error(`Invalid transform metadata: ${metadataPath}`);
  return value;
}

export function validateManifest(manifest: RawManifest): void {
  if (!manifest.source || !manifest.extractionTs || manifest.files.length === 0) throw new Error("Invalid raw manifest");
  if (manifest.rowCount !== manifest.files.reduce((sum, file) => sum + file.rowCount, 0)) throw new Error("Manifest row count does not equal file row counts");
  for (const file of manifest.files) if (!/^[a-f0-9]{64}$/i.test(file.checksum)) throw new Error(`Invalid checksum for ${file.path}`);
}
