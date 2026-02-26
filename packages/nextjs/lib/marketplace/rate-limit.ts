export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export const MARKETPLACE_RATE_LIMITS = {
  agentsRead: { limit: 240, windowMs: 60_000 },
  agentsWrite: { limit: 30, windowMs: 60_000 },
  discoverRead: { limit: 300, windowMs: 60_000 },
  hiresRead: { limit: 240, windowMs: 60_000 },
  hiresWrite: { limit: 60, windowMs: 60_000 },
  runsWrite: { limit: 120, windowMs: 60_000 },
  x402Challenge: { limit: 240, windowMs: 60_000 },
  x402Verify: { limit: 300, windowMs: 60_000 },
  x402Settle: { limit: 240, windowMs: 60_000 },
  x402Reconcile: { limit: 60, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

const rateBuckets = new Map<string, RateLimitBucket>();

function nowMs(): number {
  return Date.now();
}

function bucketKey(scope: string, actorKey: string): string {
  return `${scope}:${actorKey.toLowerCase()}`;
}

export function consumeRateLimit(
  scope: string,
  actorKey: string,
  rule: RateLimitRule,
): RateLimitResult {
  const key = bucketKey(scope, actorKey);
  const now = nowMs();
  const current = rateBuckets.get(key);

  if (!current || now >= current.resetAt) {
    const next: RateLimitBucket = {
      count: 1,
      resetAt: now + rule.windowMs,
    };
    rateBuckets.set(key, next);
    return {
      allowed: true,
      remaining: Math.max(0, rule.limit - 1),
      retryAfterSeconds: Math.ceil(rule.windowMs / 1000),
    };
  }

  if (current.count >= rule.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  rateBuckets.set(key, current);
  return {
    allowed: true,
    remaining: Math.max(0, rule.limit - current.count),
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function clearRateLimits(): void {
  rateBuckets.clear();
}
