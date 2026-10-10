import { describe, expect, it } from "vitest";
import { keepsTarget, limitOf } from "../src/report.js";
import type { StepResult } from "../src/scenarios.js";
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
