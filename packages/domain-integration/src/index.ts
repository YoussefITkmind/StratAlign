export interface LineageRecord {
  id: string;
  figureRef: string;
  sourceSystem: string;
  sourceObject: string;
  sourceField: string;
  extractionTs: Date;
  transformationId: string;
  runId: string;
  checksum: string;
  createdAt: Date;
}
