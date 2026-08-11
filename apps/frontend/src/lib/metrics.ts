import { Direction, HistoryPoint } from "@/types/kpi";

export function isFavorableVariance(actual: number, target: number, direction: Direction): boolean {
  return direction === "higher-better" ? actual >= target : actual <= target;
}

export function variance(actual: number, target: number): number {
  return actual - target;
}

export function ytdAverage(history: HistoryPoint[]): number | null {
  if (history.length === 0) return null;
  const currentYear = new Date().getFullYear();
  const ytdPoints = history.filter((h) => new Date(h.date).getFullYear() === currentYear);
  const points = ytdPoints.length > 0 ? ytdPoints : history;
  const sum = points.reduce((acc, p) => acc + p.value, 0);
  return sum / points.length;
}
