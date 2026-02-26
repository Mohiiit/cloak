type TokenProvider = "none" | "expo" | "generic";

export interface PushDispatchConfig {
  enabled: boolean;
  shadowMode: boolean;
  batchSize: number;
  leaseSeconds: number;
  maxAttempts: number;
  baseRetryMs: number;
  maxRetryMs: number;
  dispatchSecret: string | null;
  tokenProvider: TokenProvider;
  tokenProviderUrl: string | null;
  tokenProviderAuthHeader: string | null;
  expoAccessToken: string | null;
  vapidPublicKey: string | null;
  vapidPrivateKey: string | null;
  vapidSubject: string | null;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNumber(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.floor(parsed);
  if (integer < min) return min;
  if (integer > max) return max;
  return integer;
}

function parseTokenProvider(value: string | undefined): TokenProvider {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "expo") return "expo";
  if (normalized === "generic") return "generic";
  return "none";
}

export function getPushDispatchConfig(
  env: NodeJS.ProcessEnv = process.env,
): PushDispatchConfig {
  return {
    enabled: parseBoolean(env.PUSH_DISPATCH_ENABLED, true),
    shadowMode: parseBoolean(env.PUSH_DISPATCH_SHADOW_MODE, false),
    batchSize: parseNumber(env.PUSH_DISPATCH_BATCH_SIZE, 25, 1, 200),
    leaseSeconds: parseNumber(env.PUSH_DISPATCH_LEASE_SECONDS, 45, 10, 600),
    maxAttempts: parseNumber(env.PUSH_DISPATCH_MAX_ATTEMPTS, 6, 1, 30),
    baseRetryMs: parseNumber(env.PUSH_DISPATCH_BASE_RETRY_MS, 5000, 1000, 300000),
    maxRetryMs: parseNumber(env.PUSH_DISPATCH_MAX_RETRY_MS, 300000, 5000, 3600000),
    dispatchSecret:
      env.PUSH_DISPATCH_SECRET?.trim() || env.CRON_SECRET?.trim() || null,
    tokenProvider: parseTokenProvider(env.PUSH_TOKEN_PROVIDER),
    tokenProviderUrl: env.PUSH_TOKEN_PROVIDER_URL?.trim() || null,
    tokenProviderAuthHeader:
      env.PUSH_TOKEN_PROVIDER_AUTH_HEADER?.trim() || null,
    expoAccessToken: env.PUSH_EXPO_ACCESS_TOKEN?.trim() || null,
    vapidPublicKey: env.PUSH_VAPID_PUBLIC_KEY?.trim() || null,
    vapidPrivateKey: env.PUSH_VAPID_PRIVATE_KEY?.trim() || null,
    vapidSubject: env.PUSH_VAPID_SUBJECT?.trim() || null,
  };
}

