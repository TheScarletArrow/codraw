/** Percentiles of a sample, by the nearest rank; `null` for an empty sample. */
export interface Percentiles {
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

export function percentiles(values: readonly number[]): Percentiles {
  if (values.length === 0) return { count: 0, p50: null, p95: null, p99: null, max: null };
  const sorted = Float64Array.from(values).sort();
  const rank = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
  return { count: sorted.length, p50: rank(50), p95: rank(95), p99: rank(99), max: sorted[sorted.length - 1]! };
}

/** Samples of the metrics of a Prometheus text exposition, by name with labels: `name{label="value"}`. */
export type Samples = Map<string, number>;

export function parsePrometheus(text: string): Samples {
  const samples: Samples = new Map();
  for (const line of text.split("\n")) {
    if (line === "" || line.startsWith("#")) continue;
    const at = line.lastIndexOf(" ");
    const value = Number(line.slice(at + 1));
    if (at > 0 && !Number.isNaN(value)) samples.set(line.slice(0, at), value);
  }
  return samples;
}

/** The growth of a counter between two scrapes; 0 when it is missing. */
export const delta = (before: Samples, after: Samples, name: string) =>
  (after.get(name) ?? 0) - (before.get(name) ?? 0);

/**
 * A percentile of the observations a Prometheus histogram got between two scrapes, interpolated within its bucket as
 * `histogram_quantile` does; `null` without observations.
 */
export function histogramQuantile(before: Samples, after: Samples, name: string, quantile: number): number | null {
  const buckets: [number, number][] = [];
  for (const key of after.keys()) {
    const match = key.match(new RegExp(`^${name}_bucket\\{le="([^"]+)"\\}$`));
    if (match) buckets.push([match[1] === "+Inf" ? Infinity : Number(match[1]), delta(before, after, key)]);
  }
  buckets.sort(([a], [b]) => a - b);
  const total = buckets.at(-1)?.[1] ?? 0;
  if (total === 0) return null;
  const wanted = quantile * total;
  let lower = 0;
  let below = 0;
  for (const [bound, count] of buckets) {
    if (count >= wanted) {
      // The largest finite bound is all that is known of observations beyond it.
      if (bound === Infinity) return lower;
      return lower + ((bound - lower) * (wanted - below)) / Math.max(count - below, 1);
    }
    lower = bound;
    below = count;
  }
  return lower;
}

/** A value in milliseconds rounded for a report: whole above 10, one digit after the point below. */
export const ms = (value: number | null) =>
  value === null ? "—" : value >= 10 ? Math.round(value).toString() : value.toFixed(1);
