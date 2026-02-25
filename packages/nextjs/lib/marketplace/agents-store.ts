import type {
  AgentProfileResponse,
  AgentProfileStatus,
  RegisterAgentRequest,
} from "@cloak-wallet/sdk";

interface StoredAgentProfile extends AgentProfileResponse {
  endpoint_proofs: RegisterAgentRequest["endpoint_proofs"];
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
): AgentProfileResponse {
  const existing = inMemoryAgents.get(input.agent_id);
  const timestamp = nowIso();
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
    trust_score: existing?.trust_score ?? 50,
    trust_summary: existing?.trust_summary ?? defaultTrustSummary(),
    verified: existing?.verified ?? false,
    status: existing?.status ?? "active",
    registry_version: "erc8004-v1",
    last_indexed_at: timestamp,
    created_at: existing?.created_at ?? timestamp,
    updated_at: existing ? timestamp : null,
    endpoint_proofs: input.endpoint_proofs,
  };

  inMemoryAgents.set(input.agent_id, profile);
  return toPublicProfile(profile);
}

export function updateAgentProfile(
  agentId: string,
  patch: Partial<{
    verified: boolean;
    trust_score: number;
    metadata_uri: string | null;
    status: AgentProfileStatus;
    trust_summary: AgentProfileResponse["trust_summary"];
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
    updated_at: nowIso(),
  };
  inMemoryAgents.set(agentId, updated);
  return toPublicProfile(updated);
}

export function listAgentProfiles(): AgentProfileResponse[] {
  return [...inMemoryAgents.values()]
    .map(toPublicProfile)
    .sort((a, b) => a.agent_id.localeCompare(b.agent_id));
}

export function clearAgentProfiles(): void {
  inMemoryAgents.clear();
}
