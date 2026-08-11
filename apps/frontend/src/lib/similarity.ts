import { Kpi } from "@/types/kpi";

export interface SimilarMatch {
  kpi: Kpi;
  score: number;
}

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "for", "to", "in", "on", "rate", "ratio"]);

function tokenize(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  a.forEach((w) => { if (b.has(w)) intersection++; });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const SIMILARITY_THRESHOLD = 0.4;

export function findSimilar(name: string, kpis: Kpi[], excludeId?: string): SimilarMatch[] {
  const trimmed = name.trim();
  if (trimmed.length < 3) return [];
  const target = tokenize(trimmed);

  return kpis
    .filter((k) => !k.retired && k.id !== excludeId)
    .map((kpi) => ({ kpi, score: jaccard(target, tokenize(kpi.name)) }))
    .filter((m) => m.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
