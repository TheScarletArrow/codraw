export interface CollabConfig {
  port: number;
  backendUrl: string;
  internalToken: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CollabConfig {
  return {
    port: Number(env.PORT ?? 1234),
    backendUrl: required(env, "BACKEND_URL"),
    internalToken: required(env, "CODRAW_INTERNAL_TOKEN"),
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}
