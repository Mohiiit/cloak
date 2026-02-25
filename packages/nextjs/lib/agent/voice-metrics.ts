import type { VoiceUsageMetrics } from "~~/lib/agent/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getPath(source: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".");
  let cur: unknown = source;
  for (const segment of segments) {
    const node = asRecord(cur);
    if (!node || !(segment in node)) return undefined;
    cur = node[segment];
  }
  return cur;
}

function pickNumber(source: Record<string, unknown>, paths: string[]): number | undefined {
  for (const path of paths) {
    const value = toNumber(getPath(source, path));
    if (value !== undefined) return value;
  }
  return undefined;
}

function pickString(source: Record<string, unknown>, paths: string[]): string | undefined {
  for (const path of paths) {
    const value = toStringValue(getPath(source, path));
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * Extract normalized usage/credit fields from provider metadata.
 * Providers have different payload shapes, so we search common keys.
 */
export function extractVoiceUsageMetrics(meta: unknown): VoiceUsageMetrics | undefined {
  const root = asRecord(meta);
  if (!root) return undefined;
  const raw = asRecord(root.raw);
  const merged = raw ? { ...root, ...raw } : root;

  const usage: VoiceUsageMetrics = {
    creditsUsed: pickNumber(merged, [
      "credits_used",
      "credits_consumed",
      "usage.credits_used",
      "usage.credits_consumed",
      "billing.credits_used",
    ]),
    creditsRemaining: pickNumber(merged, [
      "credits_remaining",
      "remaining_credits",
      "usage.credits_remaining",
      "billing.credits_remaining",
      "balance.credits_remaining",
    ]),
    totalCredits: pickNumber(merged, [
      "total_credits",
      "usage.total_credits",
      "billing.total_credits",
      "balance.total_credits",
    ]),
    estimatedCostUsd: pickNumber(merged, [
      "cost_usd",
      "estimated_cost_usd",
      "usage.cost_usd",
      "usage.estimated_cost_usd",
      "billing.cost_usd",
      "cost",
    ]),
    durationSec: pickNumber(merged, [
      "duration",
      "duration_sec",
      "duration_seconds",
      "audio_duration",
      "audio_duration_sec",
      "usage.duration",
    ]),
    billedDurationSec: pickNumber(merged, [
      "billed_duration",
      "billed_duration_sec",
      "usage.billed_duration",
      "billing.billed_duration",
    ]),
    currency: pickString(merged, [
      "currency",
      "usage.currency",
      "billing.currency",
    ]),
    requestId: pickString(merged, [
      "request_id",
      "requestId",
      "id",
      "meta.request_id",
    ]),
  };

  const hasAny = Object.values(usage).some((value) => value !== undefined);
  return hasAny ? usage : undefined;
}
