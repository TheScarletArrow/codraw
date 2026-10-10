import type { LogFormat } from "./log.js";
import { DOCUMENT_SIZE_LIMIT } from "./size.js";

export interface CollabConfig {
  port: number;
  backendUrl: string;
  internalToken: string;
  /** Public keys of the backend that verify collab tokens. */
  jwksUrl: string;
  /** Period of checking the connections of open documents against the access to their boards, in milliseconds. */
  accessCheckInterval: number;
  /** Period of closing the connections of users whom an administrator blocked, in milliseconds. */
  blockedCheckInterval: number;
  /** The largest a board document may grow, in bytes. */
  documentSizeLimit: number;
  logFormat: LogFormat;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CollabConfig {
  return {
    port: Number(env.PORT ?? 1234),
    backendUrl: required(env, "BACKEND_URL"),
    internalToken: required(env, "CODRAW_INTERNAL_TOKEN"),
    jwksUrl: required(env, "BACKEND_JWKS_URL"),
    accessCheckInterval: positiveInteger(env, "ACCESS_CHECK_INTERVAL_MS", 60_000),
    blockedCheckInterval: positiveInteger(env, "BLOCKED_CHECK_INTERVAL_MS", 10_000),
    documentSizeLimit: positiveInteger(env, "DOCUMENT_SIZE_LIMIT_BYTES", DOCUMENT_SIZE_LIMIT),
    logFormat: logFormat(env),
  };
}

function logFormat(env: NodeJS.ProcessEnv): LogFormat {
  const value = env.LOG_FORMAT?.trim() || "text";
  if (value !== "text" && value !== "json") {
    throw new Error(`Environment variable LOG_FORMAT must be "text" or "json", got "${value}"`);
  }
  return value;
}

function positiveInteger(env: NodeJS.ProcessEnv, name: string, defaultValue: number): number {
  const value = env[name]?.trim();
  if (!value) return defaultValue;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer, got "${value}"`);
  }
  return number;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}
