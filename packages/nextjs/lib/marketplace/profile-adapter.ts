import { ERC8004Client } from "@cloak-wallet/sdk";
import type { AgentProfileResponse } from "@cloak-wallet/sdk";
import { composeTrustSummary } from "./trust-summary";

interface RegistryAdapterOptions {
  network?: "mainnet" | "sepolia";
  rpcUrl?: string;
  client?: Pick<ERC8004Client, "ownerOf" | "tokenUri" | "getSummary">;
}

function parseScore(summary: string[] | null): number {
  if (!summary || summary.length === 0) return 0;
  const raw = summary[0];
  if (!raw) return 0;
  try {
    const value = raw.startsWith("0x") ? Number.parseInt(raw, 16) : Number(raw);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
  } catch {
    return 0;
  }
}

function parseFreshnessSeconds(summary: string[] | null): number {
  if (!summary || summary.length < 2) return 0;
  const raw = summary[1];
  if (!raw) return 0;
  try {
    const value = raw.startsWith("0x") ? Number.parseInt(raw, 16) : Number(raw);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, value);
  } catch {
    return 0;
  }
}

function toNumberishAgentId(agentId: string): string | number {
  return /^\d+$/.test(agentId) ? Number(agentId) : agentId;
}

export async function adaptAgentProfileWithRegistry(
  profile: AgentProfileResponse,
  options: RegistryAdapterOptions = {},
): Promise<AgentProfileResponse> {
  const client =
    options.client ||
    new ERC8004Client({
      network: options.network || "sepolia",
      rpcUrl: options.rpcUrl,
    });

  const onchainAgentId = toNumberishAgentId(profile.agent_id);
  const [owner, tokenUri, reputationSummary, validationSummary] = await Promise.all([
    client.ownerOf(onchainAgentId),
    client.tokenUri(onchainAgentId),
    client.getSummary("reputation", onchainAgentId),
    client.getSummary("validation", onchainAgentId),
  ]);

  const ownerMatch =
    !!owner &&
    owner.toLowerCase().replace(/^0x0+/, "0x") ===
      profile.operator_wallet.toLowerCase().replace(/^0x0+/, "0x");
  const reputationScore = parseScore(reputationSummary);
  const validationScore = parseScore(validationSummary);
  const freshness = Math.max(
    parseFreshnessSeconds(reputationSummary),
    parseFreshnessSeconds(validationSummary),
  );
  const composed = composeTrustSummary({
    ownerMatch,
    reputationScore,
    validationScore,
    freshnessSeconds: freshness,
    existingTrustScore: profile.trust_score,
  });

  return {
    ...profile,
    metadata_uri: profile.metadata_uri || tokenUri || null,
    verified: profile.verified || ownerMatch,
    trust_summary: composed.trustSummary,
    trust_score: composed.trustScore,
    registry_version: profile.registry_version || "erc8004-v1",
  };
}
