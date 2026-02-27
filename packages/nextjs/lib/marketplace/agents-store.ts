import type {
  AgentProfileResponse,
  AgentProfileStatus,
  RegisterAgentRequest,
} from "@cloak-wallet/sdk";
import {
  clearDiscoveryIndex,
  ingestAgentDiscoveryProfile,
} from "./discovery-index";

interface StoredAgentProfile extends AgentProfileResponse {
  endpoint_proofs: RegisterAgentRequest["endpoint_proofs"];
}

interface UpsertAgentProfileOptions {
  onchainWrite?: {
    status: AgentProfileResponse["onchain_write_status"];
    txHash: string | null;
    reason: string | null;
    checkedAt: string;
  };
}

const inMemoryAgents = new Map<string, StoredAgentProfile>();

function nowIso(): string {
  return new Date().toISOString();
}

function createProfileId(agentId: string): string {
  return `agent_${agentId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function defaultTrustSummary(): NonNullable<AgentProfileResponse["trust_summary"]> {
  return {
    owner_match: false,
    reputation_score: 0,
    validation_score: 0,
    freshness_seconds: 0,
  };
}

function toPublicProfile(profile: StoredAgentProfile): AgentProfileResponse {
  const { endpoint_proofs: _ignored, ...publicProfile } = profile;
  return publicProfile;
}

export function getAgentProfile(agentId: string): AgentProfileResponse | null {
  const profile = inMemoryAgents.get(agentId);
  return profile ? toPublicProfile(profile) : null;
}

export function hasAgentProfile(agentId: string): boolean {
  return inMemoryAgents.has(agentId);
}

export function upsertAgentProfile(
  input: RegisterAgentRequest,
  options: UpsertAgentProfileOptions = {},
): AgentProfileResponse {
  const existing = inMemoryAgents.get(input.agent_id);
  const timestamp = nowIso();
  const onchainWrite = options.onchainWrite;
  const profile: StoredAgentProfile = {
    id: existing?.id || createProfileId(input.agent_id),
    agent_id: input.agent_id,
    name: input.name,
    description: input.description,
    image_url: input.image_url ?? null,
    agent_type: input.agent_type,
    capabilities: input.capabilities,
    endpoints: input.endpoints,
    pricing: input.pricing as unknown as Record<string, unknown>,
    metadata_uri: input.metadata_uri ?? null,
    operator_wallet: input.operator_wallet,
    service_wallet: input.service_wallet,
    trust_score: input.trust_score ?? existing?.trust_score ?? 50,
    trust_summary: existing?.trust_summary ?? defaultTrustSummary(),
    verified: input.verified ?? existing?.verified ?? false,
    status: input.status ?? existing?.status ?? "active",
    onchain_write_status: onchainWrite?.status ?? existing?.onchain_write_status,
    onchain_write_tx_hash: onchainWrite?.txHash ?? existing?.onchain_write_tx_hash ?? null,
    onchain_write_reason: onchainWrite?.reason ?? existing?.onchain_write_reason ?? null,
    onchain_write_checked_at: onchainWrite?.checkedAt ?? existing?.onchain_write_checked_at ?? null,
    registry_version: "erc8004-v1",
    last_indexed_at: timestamp,
    created_at: existing?.created_at ?? timestamp,
    updated_at: existing ? timestamp : null,
    endpoint_proofs: input.endpoint_proofs,
  };

  inMemoryAgents.set(input.agent_id, profile);
  const publicProfile = toPublicProfile(profile);
  ingestAgentDiscoveryProfile(publicProfile);
  return publicProfile;
}

export function updateAgentProfile(
  agentId: string,
  patch: Partial<{
    verified: boolean;
    trust_score: number;
    metadata_uri: string | null;
    status: AgentProfileStatus;
    trust_summary: AgentProfileResponse["trust_summary"];
    onchain_write_status: AgentProfileResponse["onchain_write_status"];
    onchain_write_tx_hash: string | null;
    onchain_write_reason: string | null;
    onchain_write_checked_at: string | null;
  }>,
): AgentProfileResponse | null {
  const existing = inMemoryAgents.get(agentId);
  if (!existing) return null;

  const updated: StoredAgentProfile = {
    ...existing,
    verified: patch.verified ?? existing.verified,
    trust_score: patch.trust_score ?? existing.trust_score,
    metadata_uri: patch.metadata_uri ?? existing.metadata_uri,
    status: patch.status ?? existing.status,
    trust_summary: patch.trust_summary ?? existing.trust_summary,
    onchain_write_status: patch.onchain_write_status ?? existing.onchain_write_status,
    onchain_write_tx_hash: patch.onchain_write_tx_hash ?? existing.onchain_write_tx_hash ?? null,
    onchain_write_reason: patch.onchain_write_reason ?? existing.onchain_write_reason ?? null,
    onchain_write_checked_at:
      patch.onchain_write_checked_at ?? existing.onchain_write_checked_at ?? null,
    last_indexed_at: nowIso(),
    updated_at: nowIso(),
  };
  inMemoryAgents.set(agentId, updated);
  const publicProfile = toPublicProfile(updated);
  ingestAgentDiscoveryProfile(publicProfile);
  return publicProfile;
}

export function listAgentProfiles(): AgentProfileResponse[] {
  return [...inMemoryAgents.values()]
    .map(toPublicProfile)
    .sort((a, b) => a.agent_id.localeCompare(b.agent_id));
}

export function clearAgentProfiles(): void {
  inMemoryAgents.clear();
  clearDiscoveryIndex();
}
