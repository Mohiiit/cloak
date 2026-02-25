import type { AgentProfileResponse } from "@cloak-wallet/sdk";

export interface RankedAgent extends AgentProfileResponse {
  discovery_score: number;
}

function freshnessPenaltySeconds(profile: AgentProfileResponse): number {
  if (!profile.last_indexed_at) return 15;
  const ageSeconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(profile.last_indexed_at)) / 1000),
  );
  // Cap the freshness penalty to avoid over-penalizing active agents.
  return Math.min(Math.floor(ageSeconds / 60), 20);
}

function scoreAgent(
  profile: AgentProfileResponse,
  query: { capability?: string },
): number {
  const trust = Math.max(0, Math.min(100, profile.trust_score));
  const verifiedBoost = profile.verified ? 15 : 0;
  const freshnessPenalty = freshnessPenaltySeconds(profile);
  const capabilityBoost =
    query.capability &&
    profile.capabilities.some((item) => item.toLowerCase() === query.capability?.toLowerCase())
      ? 10
      : 0;
  const activityBoost = profile.status === "active" ? 5 : 0;
  return trust + verifiedBoost + capabilityBoost + activityBoost - freshnessPenalty;
}

export function rankDiscoveredAgents(
  profiles: AgentProfileResponse[],
  query: { capability?: string },
): RankedAgent[] {
  return profiles
    .map((profile) => ({
      ...profile,
      discovery_score: scoreAgent(profile, query),
    }))
    .sort((a, b) => {
      if (b.discovery_score !== a.discovery_score) {
        return b.discovery_score - a.discovery_score;
      }
      return b.trust_score - a.trust_score;
    });
}

