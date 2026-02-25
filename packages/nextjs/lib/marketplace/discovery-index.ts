import type { AgentProfileResponse, AgentType } from "@cloak-wallet/sdk";

export interface DiscoveryIndexRecord {
  agentId: string;
  agentType: AgentType;
  capabilities: string[];
  verified: boolean;
  trustScore: number;
  status: string;
  indexedAt: string;
}

const recordsByAgent = new Map<string, DiscoveryIndexRecord>();
const capabilityIndex = new Map<string, Set<string>>();
const typeIndex = new Map<AgentType, Set<string>>();

function normalizeCapability(value: string): string {
  return value.trim().toLowerCase();
}

function nowIso(): string {
  return new Date().toISOString();
}

function unlinkAgent(agentId: string): void {
  const existing = recordsByAgent.get(agentId);
  if (!existing) return;

  for (const capability of existing.capabilities) {
    const bucket = capabilityIndex.get(capability);
    if (!bucket) continue;
    bucket.delete(agentId);
    if (bucket.size === 0) capabilityIndex.delete(capability);
  }

  const typeBucket = typeIndex.get(existing.agentType);
  if (typeBucket) {
    typeBucket.delete(agentId);
    if (typeBucket.size === 0) typeIndex.delete(existing.agentType);
  }
}

export function ingestAgentDiscoveryProfile(profile: AgentProfileResponse): void {
  unlinkAgent(profile.agent_id);
  const record: DiscoveryIndexRecord = {
    agentId: profile.agent_id,
    agentType: profile.agent_type,
    capabilities: profile.capabilities.map(normalizeCapability),
    verified: profile.verified,
    trustScore: profile.trust_score,
    status: profile.status || "active",
    indexedAt: nowIso(),
  };
  recordsByAgent.set(profile.agent_id, record);

  for (const capability of record.capabilities) {
    const bucket = capabilityIndex.get(capability) ?? new Set<string>();
    bucket.add(record.agentId);
    capabilityIndex.set(capability, bucket);
  }

  const typeBucket = typeIndex.get(record.agentType) ?? new Set<string>();
  typeBucket.add(record.agentId);
  typeIndex.set(record.agentType, typeBucket);
}

export function removeAgentDiscoveryProfile(agentId: string): void {
  unlinkAgent(agentId);
  recordsByAgent.delete(agentId);
}

export function listDiscoveryRecords(): DiscoveryIndexRecord[] {
  return [...recordsByAgent.values()];
}

export function selectDiscoveryAgentIds(filters?: {
  capability?: string;
  agentType?: AgentType;
}): string[] {
  if (!filters?.capability && !filters?.agentType) {
    return [...recordsByAgent.keys()];
  }

  let ids: Set<string> | null = null;

  if (filters.capability) {
    ids = new Set(
      capabilityIndex.get(normalizeCapability(filters.capability)) || [],
    );
  }

  if (filters.agentType) {
    const typeIds = new Set(typeIndex.get(filters.agentType) || []);
    if (!ids) {
      ids = typeIds;
    } else {
      ids = new Set([...ids].filter((id) => typeIds.has(id)));
    }
  }

  return [...(ids || [])];
}

export function clearDiscoveryIndex(): void {
  recordsByAgent.clear();
  capabilityIndex.clear();
  typeIndex.clear();
}

