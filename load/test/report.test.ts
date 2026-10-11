import { describe, expect, it } from "vitest";
import { keepsTarget, limitOf, report } from "../src/report.js";
import type { RunOptions, StepResult } from "../src/scenarios.js";
import { percentiles } from "../src/stats.js";

const step = (name: string, p95: number, changes: Partial<StepResult> = {}): StepResult => ({
  scenario: "boards",
  step: name,
  boards: 1,
  participants: 3,
  connect: percentiles([50]),
  connectFailures: 0,
  edits: { count: 100, p50: p95 / 2, p95, p99: p95, max: p95 },
  cursors: percentiles([10]),
  editsSent: 100,
  delivered: 1,
  cursorsSent: 100,
  disconnects: 0,
  authenticationFailures: 0,
  tokenFailures: 0,
  clientEventLoopDelayP99: 5,
  collab: null,
  usage: {},
  notes: {},
  ...changes,
});

describe("the target of a step", () => {
  it("is the p95 of delivering an edit without losses and refusals", () => {
    expect(keepsTarget(step("a", 150), 200)).toBe(true);
    expect(keepsTarget(step("a", 250), 200)).toBe(false);
    expect(keepsTarget(step("a", 150, { delivered: 0.99 }), 200)).toBe(false);
    expect(keepsTarget(step("a", 150, { connectFailures: 1 }), 200)).toBe(false);
    expect(keepsTarget(step("a", 150, { tokenFailures: 1 }), 200)).toBe(false);
  });

  it("gives the limit of a scenario as the last step that kept it and the first that did not", () => {
    const steps = [step("50", 20), step("100", 40), step("200", 400), step("400", 90)];
    expect(limitOf(steps, 200)).toEqual({ kept: steps[1], broke: steps[2] });
    expect(limitOf(steps.slice(0, 2), 200)).toEqual({ kept: steps[1], broke: null });
    expect(limitOf([step("1", 500)], 200)).toEqual({ kept: null, broke: expect.objectContaining({ step: "1" }) });
  });
});

describe("the report", () => {
  const options = {
    baseUrl: "http://localhost:8080",
    workers: 4,
    behaviour: { editInterval: 3000, cursorInterval: 250, shapes: 20 },
    warmup: 10,
    duration: 60,
  } as RunOptions;
  const collab = {
    stores: 31,
    storeFailures: 0,
    storeMean: 200,
    storeP95: 457,
    rejections: 0,
    connections: 69,
    documents: 23,
    cpu: 14,
    memory: 384,
  };
  const large = step("3 × 3, 14.4 MiB", 106, { scenario: "large", collab });
  const neighbours = step("соседние 20 × 3", 250, {
    scenario: "large",
    boards: 20,
    participants: 60,
    collab,
    sharedWithPrevious: true,
  });

  it("gives the neighbour boards of large boards a row of their own, with the stores and resources shown once", () => {
    const rows = report([large, neighbours], { options, slo: 200 })
      .split("\n")
      .filter((line) => line.startsWith("| large"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/^\| large \| 3 × 3, 14\.4 MiB \| 3 \| .* \| 31 \| 457 \| .* \| да \|$/);
    expect(rows[1]).toMatch(/^\| large \| соседние 20 × 3 \| 60 \| .* \| 0 \| ″ \| ″ \| ″ \| ″ \| ″ \| нет \|$/);
  });

  it("explains the shared columns and compares the edits of both rows", () => {
    const text = report([large, neighbours], { options, slo: 200 });
    expect(text).toContain("- large «соседние 20 × 3»: доски работали в том же окне");
    expect(text).toContain("p95 правки 250 мс против 106 мс у «3 × 3, 14.4 MiB»");
  });
});
