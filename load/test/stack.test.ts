import { describe, expect, it } from "vitest";
import { mebibytes } from "../src/stack.js";

describe("mebibytes", () => {
  it("reads the memory of a container as docker stats prints it", () => {
    expect(mebibytes("152.5MiB")).toBe(152.5);
    expect(mebibytes("1.5GiB")).toBe(1536);
    expect(mebibytes("512KiB")).toBe(0.5);
    expect(mebibytes("--")).toBeNaN();
  });
});
