import type {
  AgentProfileResponse,
  AgentProfileStatus,
  RegisterAgentRequest,
} from "@cloak-wallet/sdk";
import { getSupabase } from "~~/app/api/v1/_lib/supabase";
import {
  getAgentProfile,
  listAgentProfiles,
  upsertAgentProfile,
  updateAgentProfile,
} from "./agents-store";
import { hasSupabaseEnv, nowIso, parseJsonArray, parseJsonObject } from "./repo-utils";

interface AgentProfileRow {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  image_url: string | null;
  agent_type: AgentProfileResponse["agent_type"];
  capabilities: unknown;
  endpoints: unknown;
  pricing: unknown;
  metadata_uri: string | null;
  operator_wallet: string;
  service_wallet: string;
  trust_score: number;
  trust_summary: unknown;
  verified: boolean;
  status: AgentProfileStatus;
  onchain_write_status: AgentProfileResponse["onchain_write_status"] | null;
  onchain_write_tx_hash: string | null;
  onchain_write_reason: string | null;
  onchain_write_checked_at: string | null;
  registry_version: string;
  last_indexed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

interface UpsertAgentProfileRecordOptions {
  onchainWrite?: {
    status: AgentProfileResponse["onchain_write_status"];
    txHash: string | null;
    reason: string | null;
    checkedAt: string;
  };
}

function profileId(agentId: string): string {
  return `agent_${agentId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function fromRow(row: AgentProfileRow): AgentProfileResponse {
  return {
    id: row.id,
    agent_id: row.agent_id,
    name: row.name,
    description: row.description,
    image_url: row.image_url,
    agent_type: row.agent_type,
    capabilities: parseJsonArray(row.capabilities),
    endpoints: parseJsonArray(row.endpoints),
    pricing: parseJsonObject(row.pricing),
    metadata_uri: row.metadata_uri,
    operator_wallet: row.operator_wallet,
    service_wallet: row.service_wallet,
    trust_score: row.trust_score,
    trust_summary: parseJsonObject(row.trust_summary, {
      owner_match: false,
      reputation_score: 0,
      validation_score: 0,
      freshness_seconds: 0,
    }) as unknown as AgentProfileResponse["trust_summary"],
    verified: !!row.verified,
    status: row.status,
    onchain_write_status: row.onchain_write_status ?? undefined,
    onchain_write_tx_hash: row.onchain_write_tx_hash,
    onchain_write_reason: row.onchain_write_reason,
    onchain_write_checked_at: row.onchain_write_checked_at,
    registry_version: row.registry_version,
    last_indexed_at: row.last_indexed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getAgentProfileRecord(agentId: string): Promise<AgentProfileResponse | null> {
  if (!hasSupabaseEnv()) return getAgentProfile(agentId);

  try {
    const sb = getSupabase();
    const rows = await sb.select<AgentProfileRow>(
      "agent_profiles",
      `agent_id=eq.${encodeURIComponent(agentId)}`,
      { limit: 1 },
    );
    return rows[0] ? fromRow(rows[0]) : null;
  } catch {
    return getAgentProfile(agentId);
  }
}

export async function listAgentProfileRecords(): Promise<AgentProfileResponse[]> {
  if (!hasSupabaseEnv()) return listAgentProfiles();

  try {
    const sb = getSupabase();
    const rows = await sb.select<AgentProfileRow>("agent_profiles", undefined, {
      orderBy: "created_at.desc",
      limit: 1000,
    });
    return rows.map(fromRow);
  } catch {
    return listAgentProfiles();
  }
}

export async function upsertAgentProfileRecord(
  input: RegisterAgentRequest,
  options: UpsertAgentProfileRecordOptions = {},
): Promise<AgentProfileResponse> {
  if (!hasSupabaseEnv()) return upsertAgentProfile(input, options);

  const existing = await getAgentProfileRecord(input.agent_id);
  const timestamp = nowIso();
  const onchainWrite = options.onchainWrite;
  const row: AgentProfileRow = {
    id: existing?.id || profileId(input.agent_id),
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
    trust_summary: (existing?.trust_summary as unknown as Record<string, unknown>) ?? {
      owner_match: false,
      reputation_score: 0,
      validation_score: 0,
      freshness_seconds: 0,
    },
    verified: input.verified ?? existing?.verified ?? false,
    status: input.status ?? existing?.status ?? "active",
    onchain_write_status: onchainWrite?.status ?? existing?.onchain_write_status,
    onchain_write_tx_hash: onchainWrite?.txHash ?? existing?.onchain_write_tx_hash ?? null,
    onchain_write_reason: onchainWrite?.reason ?? existing?.onchain_write_reason ?? null,
    onchain_write_checked_at:
      onchainWrite?.checkedAt ?? existing?.onchain_write_checked_at ?? null,
    registry_version: existing?.registry_version ?? "erc8004-v1",
    last_indexed_at: timestamp,
    created_at: existing?.created_at ?? timestamp,
    updated_at: existing ? timestamp : null,
  };

  try {
    const sb = getSupabase();
    const rows = await sb.upsert<AgentProfileRow>(
      "agent_profiles",
      row as unknown as Record<string, unknown>,
      "agent_id",
    );
    return fromRow(rows[0] ?? row);
  } catch {
    return upsertAgentProfile(input, options);
  }
}

export async function updateAgentProfileRecord(
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
): Promise<AgentProfileResponse | null> {
  if (!hasSupabaseEnv()) return updateAgentProfile(agentId, patch);

  const existing = await getAgentProfileRecord(agentId);
  if (!existing) return null;

  try {
    const sb = getSupabase();
    const rows = await sb.update<AgentProfileRow>(
      "agent_profiles",
      `agent_id=eq.${encodeURIComponent(agentId)}`,
      {
        verified: patch.verified ?? existing.verified,
        trust_score: patch.trust_score ?? existing.trust_score,
        metadata_uri: patch.metadata_uri ?? existing.metadata_uri,
        status: patch.status ?? existing.status,
        onchain_write_status: patch.onchain_write_status ?? existing.onchain_write_status,
        onchain_write_tx_hash:
          patch.onchain_write_tx_hash ?? existing.onchain_write_tx_hash ?? null,
        onchain_write_reason: patch.onchain_write_reason ?? existing.onchain_write_reason ?? null,
        onchain_write_checked_at:
          patch.onchain_write_checked_at ?? existing.onchain_write_checked_at ?? null,
        trust_summary:
          (patch.trust_summary as unknown as Record<string, unknown>) ??
          (existing.trust_summary as unknown as Record<string, unknown>),
        last_indexed_at: nowIso(),
        updated_at: nowIso(),
      },
    );
    return rows[0] ? fromRow(rows[0]) : null;
  } catch {
    return updateAgentProfile(agentId, patch);
  }
}
