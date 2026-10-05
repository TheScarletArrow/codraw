export interface CollabConfig {
  port: number;
  backendUrl: string;
  internalToken: string;
  /** Public keys of the backend that verify collab tokens. */
  jwksUrl: string;
  /** Period of checking the connections of open documents against the access to their boards, in milliseconds. */
  accessCheckInterval: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CollabConfig {
  return {
    port: Number(env.PORT ?? 1234),
    backendUrl: required(env, "BACKEND_URL"),
    internalToken: required(env, "CODRAW_INTERNAL_TOKEN"),
    jwksUrl: required(env, "BACKEND_JWKS_URL"),
    accessCheckInterval: positiveInteger(env, "ACCESS_CHECK_INTERVAL_MS", 60_000),
  };
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
