import { describe, expect, it } from "vitest";
import { histogramQuantile, ms, parsePrometheus, percentiles } from "../src/stats.js";

describe("percentiles", () => {
  it("takes the nearest rank of a sample", () => {
    const values = Array.from({ length: 100 }, (_, index) => 100 - index);
    expect(percentiles(values)).toEqual({ count: 100, p50: 50, p95: 95, p99: 99, max: 100 });
  });

  it("has nothing to tell of an empty sample", () => {
    expect(percentiles([])).toEqual({ count: 0, p50: null, p95: null, p99: null, max: null });
  });
});

describe("metrics of collab", () => {
  const scrape = (stored: number, buckets: [string, number][]) =>
    parsePrometheus(
      [
        "# HELP codraw_collab_stores_total Stores",
        "# TYPE codraw_collab_stores_total counter",
        `codraw_collab_stores_total{result="stored"} ${stored}`,
        ...buckets.map(([le, count]) => `codraw_collab_store_duration_seconds_bucket{le="${le}"} ${count}`),
        "",
      ].join("\n"),
    );

  it("reads samples by their names with labels", () => {
    expect(scrape(7, []).get('codraw_collab_stores_total{result="stored"}')).toBe(7);
  });

  it("interpolates a percentile of what a histogram got between two scrapes within its bucket", () => {
    const before = scrape(0, [
      ["0.1", 10],
      ["0.5", 10],
      ["+Inf", 10],
    ]);
    const after = scrape(0, [
      ["0.1", 10],
      ["0.5", 110],
      ["+Inf", 110],
    ]);
    // All 100 new observations are between 0.1 and 0.5: the 95th is at 95 % of that bucket.
    expect(histogramQuantile(before, after, "codraw_collab_store_duration_seconds", 0.95)).toBeCloseTo(0.48);
    expect(histogramQuantile(after, after, "codraw_collab_store_duration_seconds", 0.95)).toBeNull();
  });

  it("gives the largest finite bound for observations beyond it", () => {
    const before = scrape(0, [
      ["1", 0],
      ["+Inf", 0],
    ]);
    const after = scrape(0, [
      ["1", 0],
      ["+Inf", 4],
    ]);
    expect(histogramQuantile(before, after, "codraw_collab_store_duration_seconds", 0.5)).toBe(1);
  });
});

describe("ms", () => {
  it("rounds large values to whole milliseconds and keeps a digit of small ones", () => {
    expect(ms(123.4)).toBe("123");
    expect(ms(3.14)).toBe("3.1");
    expect(ms(null)).toBe("—");
  });
});
