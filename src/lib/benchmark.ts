import type { ObservedResult, Provider } from "./types";

export type Sample = { index: number; warmup: boolean; result: ObservedResult };
export function statistics(values: number[]) {
  const sorted = values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, median: null, p95: null };
  const middle = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}
export function benchmarkSummary(samples: Sample[], provider: Provider) {
  const eligible = samples.filter((s) => s.result.provider === provider && s.result.source === "live" && !s.warmup);
  const successes = eligible.filter((s) => s.result.ok && s.result.timing && s.result.browserCompleteMs !== null);
  return {
    attempted: eligible.length,
    failures: eligible.filter((s) => !s.result.ok).length,
    warmups: samples.filter((s) => s.result.provider === provider && s.result.source === "live" && s.warmup).length,
    provider: statistics(successes.map((s) => s.result.timing!.providerCompleteMs)),
    browser: statistics(successes.map((s) => s.result.browserCompleteMs!)),
    firstText: statistics(
      successes.flatMap((s) =>
        s.result.timing?.providerFirstTextMs == null ? [] : [s.result.timing.providerFirstTextMs],
      ),
    ),
  };
}
export const MAX_SAMPLES = 10;
export const MAX_WARMUPS = 2;
export function benchmarkBounds(samples: number, warmups: number) {
  if (
    !Number.isInteger(samples) ||
    samples < 1 ||
    samples > MAX_SAMPLES ||
    !Number.isInteger(warmups) ||
    warmups < 0 ||
    warmups > MAX_WARMUPS
  )
    throw new Error("Use 1-10 measured rounds and 0-2 warmup rounds.");
  return { samples, warmups };
}
