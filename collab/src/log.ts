/** `json`: one line of JSON per event with the fields of the Elastic Common Schema; `text`: plain console output. */
export type LogFormat = "text" | "json";

type Fields = Record<string, unknown>;

export type LogLevel = "info" | "warn" | "error";

/** Writes a line of the log; warnings and errors go to stderr. */
type Writer = (level: LogLevel, line: string) => void;

const toConsole: Writer = (level, line) => {
  (level === "info" ? process.stdout : process.stderr).write(`${line}\n`);
};

let format: LogFormat = "text";
let write: Writer = toConsole;

/** Sets the format of the log, and where it goes: tests catch the lines. */
export function configureLogging(logFormat: LogFormat, writer: Writer = toConsole) {
  format = logFormat;
  write = writer;
}

function entry(level: LogLevel, message: string, error: unknown, fields: Fields) {
  if (format === "text") {
    const extra = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : "";
    write(level, `${level.toUpperCase()} ${message}${extra}${error instanceof Error ? `\n${error.stack}` : ""}`);
    return;
  }
  write(
    level,
    JSON.stringify({
      "@timestamp": new Date().toISOString(),
      "log.level": level,
      message,
      "service.name": "codraw-collab",
      "ecs.version": "8.11",
      ...(error instanceof Error && {
        "error.type": error.name,
        "error.message": error.message,
        "error.stack_trace": error.stack,
      }),
      ...(error !== undefined && !(error instanceof Error) && { "error.message": String(error) }),
      ...fields,
    }),
  );
}

export const log = {
  info(message: string, fields: Fields = {}) {
    entry("info", message, undefined, fields);
  },
  /** Something that works, but not as it should, e.g. work that is to be off the main thread done on it. */
  warn(message: string, fields: Fields = {}) {
    entry("warn", message, undefined, fields);
  },
  error(message: string, error?: unknown, fields: Fields = {}) {
    entry("error", message, error, fields);
  },
};
