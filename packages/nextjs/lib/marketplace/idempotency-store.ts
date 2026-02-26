import { createHash } from "crypto";

interface IdempotencyRecord {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  requestHash: string;
  createdAtMs: number;
}

type IdempotencyLookup =
  | { kind: "miss" }
  | { kind: "conflict" }
  | { kind: "replay"; record: IdempotencyRecord };

const inMemoryStore = new Map<string, IdempotencyRecord>();

function ttlMs(): number {
  const raw = Number(process.env.MARKETPLACE_IDEMPOTENCY_TTL_MS || "900000");
  if (!Number.isFinite(raw) || raw <= 0) return 900_000;
  return Math.min(raw, 86_400_000);
}

function stableJson(input: unknown): string {
  if (input === null || input === undefined) return "null";
  if (typeof input !== "object") return JSON.stringify(input);
  if (Array.isArray(input)) {
    return `[${input.map(item => stableJson(item)).join(",")}]`;
  }
  const entries = Object.entries(input as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${JSON.stringify(key)}:${stableJson(value)}`);
  return `{${entries.join(",")}}`;
}

function scopedKey(scope: string, actor: string, idempotencyKey: string): string {
  return `${scope}::${actor.toLowerCase()}::${idempotencyKey}`;
}

function pruneExpired(nowMs: number): void {
  const ttl = ttlMs();
  for (const [key, value] of inMemoryStore.entries()) {
    if (nowMs - value.createdAtMs > ttl) {
      inMemoryStore.delete(key);
    }
  }
}

export function hashIdempotencyRequest(payload: unknown): string {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

export function lookupIdempotencyRecord(input: {
  scope: string;
  actor: string;
  idempotencyKey: string;
  requestHash: string;
}): IdempotencyLookup {
  const nowMs = Date.now();
  pruneExpired(nowMs);
  const key = scopedKey(input.scope, input.actor, input.idempotencyKey);
  const record = inMemoryStore.get(key);
  if (!record) return { kind: "miss" };
  if (record.requestHash !== input.requestHash) return { kind: "conflict" };
  return { kind: "replay", record };
}

export function saveIdempotencyRecord(input: {
  scope: string;
  actor: string;
  idempotencyKey: string;
  requestHash: string;
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}): void {
  const key = scopedKey(input.scope, input.actor, input.idempotencyKey);
  inMemoryStore.set(key, {
    status: input.status,
    body: input.body,
    headers: input.headers,
    requestHash: input.requestHash,
    createdAtMs: Date.now(),
  });
}

export function clearIdempotencyStore(): void {
  inMemoryStore.clear();
}
