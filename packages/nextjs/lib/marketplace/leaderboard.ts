/**
 * Leaderboard Scoring Engine
 *
 * Computes agent rankings based on:
 *   work_score = 0.40 * normalized_successful_runs
 *              + 0.25 * normalized_settled_volume
 *              + 0.15 * success_rate
 *              + 0.10 * trust_score_norm
 *              + 0.10 * freshness_norm
 */

import type {
  AgentType,
  AgentOnchainStatus,
  LeaderboardEntry,
  LeaderboardPeriod,
} from "@cloak-wallet/sdk";
import { listRunRecords } from "./runs-repo";
import { listAgentProfileRecords } from "./agents-repo";

// ─── Period → ms ─────────────────────────────────────────────────────────────

const PERIOD_MS: Record<LeaderboardPeriod, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

// ─── Scoring weights ─────────────────────────────────────────────────────────

const W_RUNS = 0.40;
const W_VOLUME = 0.25;
const W_SUCCESS = 0.15;
const W_TRUST = 0.10;
const W_FRESHNESS = 0.10;

// ─── Normalize ───────────────────────────────────────────────────────────────

export function normalizeMetric(
  value: number,
  min: number,
  max: number,
): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// ─── Per-agent metrics ───────────────────────────────────────────────────────

interface AgentMetrics {
  agentId: string;
  name: string;
  agentType: AgentType;
  successfulRuns: number;
  totalRuns: number;
  settledRuns: number;
  settledVolume: bigint;
  avgLatencyMs: number;
  trustScore: number;
  onchainStatus: AgentOnchainStatus;
  lastRunAt: number; // epoch ms
  updatedAt: string;
}

// ─── Score a single agent ────────────────────────────────────────────────────

export function scoreAgent(
  metrics: {
    successfulRuns: number;
    settledVolume: number;
    successRate: number;
    trustScore: number;
    freshness: number;
  },
  ranges: {
    maxRuns: number;
    maxVolume: number;
  },
): number {
  const normRuns = normalizeMetric(metrics.successfulRuns, 0, ranges.maxRuns);
  const normVolume = normalizeMetric(metrics.settledVolume, 0, ranges.maxVolume);
  const normSuccess = metrics.successRate; // already 0..1
  const normTrust = normalizeMetric(metrics.trustScore, 0, 100);
  const normFreshness = metrics.freshness; // already 0..1

  return (
    W_RUNS * normRuns +
    W_VOLUME * normVolume +
    W_SUCCESS * normSuccess +
    W_TRUST * normTrust +
    W_FRESHNESS * normFreshness
  );
}

// ─── Compute leaderboard ─────────────────────────────────────────────────────

export interface ComputeLeaderboardOptions {
  capability?: string;
  agentType?: AgentType;
  limit?: number;
  offset?: number;
}

export async function computeLeaderboard(
  period: LeaderboardPeriod,
  options: ComputeLeaderboardOptions = {},
): Promise<LeaderboardEntry[]> {
  const cutoff = Date.now() - PERIOD_MS[period];
  const cutoffIso = new Date(cutoff).toISOString();

  const [allRuns, allProfiles] = await Promise.all([
    listRunRecords(),
    listAgentProfileRecords(),
  ]);

  // Build a profile lookup
  const profileMap = new Map(
    allProfiles.map((p) => [p.agent_id, p]),
  );

  // Filter runs within period
  const periodRuns = allRuns.filter(
    (r) => r.created_at >= cutoffIso,
  );

  // Aggregate per agent
  const metricsMap = new Map<string, AgentMetrics>();
  for (const run of periodRuns) {
    const profile = profileMap.get(run.agent_id);
    if (!profile) continue;

    if (options.agentType && profile.agent_type !== options.agentType) continue;
    if (
      options.capability &&
      !profile.capabilities.includes(options.capability)
    )
      continue;

    let m = metricsMap.get(run.agent_id);
    if (!m) {
      m = {
        agentId: run.agent_id,
        name: profile.name,
        agentType: profile.agent_type,
        successfulRuns: 0,
        totalRuns: 0,
        settledRuns: 0,
        settledVolume: 0n,
        avgLatencyMs: 0,
        trustScore: profile.trust_score,
        onchainStatus: profile.onchain_status ?? "unknown",
        lastRunAt: 0,
        updatedAt: profile.updated_at ?? profile.created_at,
      };
      metricsMap.set(run.agent_id, m);
    }

    m.totalRuns++;
    if (run.status === "completed") m.successfulRuns++;

    const isSettled =
      run.payment_evidence &&
      (run.payment_evidence as Record<string, unknown>).state === "settled";
    if (isSettled) {
      m.settledRuns++;
      // Approximate volume from pricing if available
      const pricing = profile.pricing as Record<string, unknown> | undefined;
      if (pricing?.amount) {
        try {
          m.settledVolume += BigInt(pricing.amount as string);
        } catch {
          // non-numeric pricing, skip
        }
      }
    }

    const runTs = new Date(run.created_at).getTime();
    if (runTs > m.lastRunAt) m.lastRunAt = runTs;

    // Approximate latency from created_at → updated_at
    if (run.updated_at && run.status === "completed") {
      const latency =
        new Date(run.updated_at).getTime() -
        new Date(run.created_at).getTime();
      // Running average
      const prevTotal = m.avgLatencyMs * (m.successfulRuns - 1);
      m.avgLatencyMs = Math.round(
        (prevTotal + latency) / m.successfulRuns,
      );
    }
  }

  // Also include profiles with zero runs if they match filters
  for (const profile of allProfiles) {
    if (metricsMap.has(profile.agent_id)) continue;
    if (options.agentType && profile.agent_type !== options.agentType) continue;
    if (
      options.capability &&
      !profile.capabilities.includes(options.capability)
    )
      continue;
    metricsMap.set(profile.agent_id, {
      agentId: profile.agent_id,
      name: profile.name,
      agentType: profile.agent_type,
      successfulRuns: 0,
      totalRuns: 0,
      settledRuns: 0,
      settledVolume: 0n,
      avgLatencyMs: 0,
      trustScore: profile.trust_score,
      onchainStatus: profile.onchain_status ?? "unknown",
      lastRunAt: 0,
      updatedAt: profile.updated_at ?? profile.created_at,
    });
  }

  // Compute ranges for normalization
  const allMetrics = [...metricsMap.values()];
  const maxRuns = Math.max(1, ...allMetrics.map((m) => m.successfulRuns));
  const maxVolume = Math.max(
    1,
    ...allMetrics.map((m) => Number(m.settledVolume)),
  );

  // Score each agent
  const now = Date.now();
  const periodMs = PERIOD_MS[period];
  const entries: LeaderboardEntry[] = allMetrics.map((m) => {
    const successRate =
      m.totalRuns > 0 ? m.successfulRuns / m.totalRuns : 0;
    const freshness =
      m.lastRunAt > 0
        ? normalizeMetric(m.lastRunAt, cutoff, now)
        : 0;

    const workScore = scoreAgent(
      {
        successfulRuns: m.successfulRuns,
        settledVolume: Number(m.settledVolume),
        successRate,
        trustScore: m.trustScore,
        freshness,
      },
      { maxRuns, maxVolume },
    );

    return {
      agent_id: m.agentId,
      name: m.name,
      agent_type: m.agentType,
      work_score: Math.round(workScore * 10000) / 10000,
      successful_runs: m.successfulRuns,
      settled_runs: m.settledRuns,
      settled_volume: m.settledVolume.toString(),
      success_rate: Math.round(successRate * 10000) / 10000,
      avg_execution_latency_ms: m.avgLatencyMs,
      trust_score: m.trustScore,
      onchain_status: m.onchainStatus,
      updated_at: m.updatedAt,
    };
  });

  // Sort by work_score desc, tiebreak by successful_runs desc
  entries.sort((a, b) => {
    if (b.work_score !== a.work_score) return b.work_score - a.work_score;
    return b.successful_runs - a.successful_runs;
  });

  const offset = options.offset ?? 0;
  const limit = options.limit ?? 50;
  return entries.slice(offset, offset + limit);
}
