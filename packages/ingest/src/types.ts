export interface TransformMetadata {
  version: string;
  description: string;
  expectedOutputColumns: string[];
}

export type SqlParams = Record<string, string | number | boolean | Date>;

export interface ValidationResult<T = Record<string, unknown>> {
  passed: boolean;
  details: T[];
}

export interface RawManifestFile { path: string; rowCount: number; checksum: string }
export interface RawManifest {
  source: string;
  extractionTs: string;
  rowCount: number;
  files: RawManifestFile[];
}

export interface LineageInput {
  figureRef: string;
  sourceSystem: string;
  sourceObject: string;
  sourceField: string;
  extractionTs: Date;
  transformationId: string;
  runId: string;
  checksum: string;
}
