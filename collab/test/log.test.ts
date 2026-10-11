import { afterEach, describe, expect, it } from "vitest";
import { configureLogging, log, type LogLevel } from "../src/log.js";

describe("log", () => {
  const lines: { level: string; line: string }[] = [];
  const capture = (level: LogLevel, line: string) => lines.push({ level, line });

  afterEach(() => {
    lines.splice(0);
    configureLogging("text");
  });

  it("writes one line of JSON per event with the fields of ECS", () => {
    configureLogging("json", capture);

    log.info("collab listens on port 1234", { "server.port": 1234 });

    expect(lines).toHaveLength(1);
    expect(lines[0]!.level).toBe("info");
    const entry = JSON.parse(lines[0]!.line);
    expect(entry).toMatchObject({
      "log.level": "info",
      message: "collab listens on port 1234",
      "service.name": "codraw-collab",
      "server.port": 1234,
    });
    expect(new Date(entry["@timestamp"]).getTime()).not.toBeNaN();
  });

  it("writes an error with its type, message and stack", () => {
    configureLogging("json", capture);

    log.error("Failed to store board b1", new TypeError("fetch failed"), { "codraw.board": "b1" });

    const entry = JSON.parse(lines[0]!.line);
    expect(lines[0]!.level).toBe("error");
    expect(entry).toMatchObject({
      "log.level": "error",
      message: "Failed to store board b1",
      "error.type": "TypeError",
      "error.message": "fetch failed",
      "codraw.board": "b1",
    });
    expect(entry["error.stack_trace"]).toContain("TypeError: fetch failed");
  });

  it("writes a warning without an error", () => {
    configureLogging("json", capture);

    log.warn("Encoding document b1 on the main thread", { "codraw.document": "b1" });

    expect(lines[0]!.level).toBe("warn");
    expect(JSON.parse(lines[0]!.line)).toMatchObject({ "log.level": "warn", "codraw.document": "b1" });
  });

  it("writes plain text by default", () => {
    configureLogging("text", capture);

    log.error("Failed to store board b1", new Error("down"));

    expect(lines[0]!.line).toMatch(/^ERROR Failed to store board b1\nError: down/);
  });
});
