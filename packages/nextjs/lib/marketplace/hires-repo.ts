import type {
  AgentHireResponse,
  AgentHireStatus,
  CreateAgentHireRequest,
} from "@cloak-wallet/sdk";
import { getSupabase } from "~~/app/api/v1/_lib/supabase";
import { createHire, getHire, listHires, updateHireStatus } from "./hires-store";
import { hasSupabaseEnv, nowIso, parseJsonObject, randomId } from "./repo-utils";

interface AgentHireRow {
  id: string;
  agent_id: string;
  operator_wallet: string;
  policy_snapshot: unknown;
  billing_mode: AgentHireResponse["billing_mode"];
  status: AgentHireStatus;
  created_at: string;
  updated_at: string | null;
}

function fromRow(row: AgentHireRow): AgentHireResponse {
  return {
    id: row.id,
    agent_id: row.agent_id,
    operator_wallet: row.operator_wallet,
    policy_snapshot: parseJsonObject(row.policy_snapshot),
    billing_mode: row.billing_mode,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createHireRecord(
  input: CreateAgentHireRequest,
): Promise<AgentHireResponse> {
  if (!hasSupabaseEnv()) return createHire(input);

  const row: AgentHireRow = {
    id: randomId("hire"),
    agent_id: input.agent_id,
    operator_wallet: input.operator_wallet,
    policy_snapshot: input.policy_snapshot,
    billing_mode: input.billing_mode,
    status: "active",
    created_at: nowIso(),
    updated_at: null,
  };

  try {
    const sb = getSupabase();
    const rows = await sb.insert<AgentHireRow>("agent_hires", row);
    return fromRow(rows[0] ?? row);
  } catch {
    return createHire(input);
  }
}

export async function getHireRecord(id: string): Promise<AgentHireResponse | null> {
  if (!hasSupabaseEnv()) return getHire(id);

  try {
    const sb = getSupabase();
    const rows = await sb.select<AgentHireRow>(
      "agent_hires",
      `id=eq.${encodeURIComponent(id)}`,
      { limit: 1 },
    );
    return rows[0] ? fromRow(rows[0]) : null;
  } catch {
    return getHire(id);
  }
}

export async function updateHireStatusRecord(
  id: string,
  status: AgentHireStatus,
): Promise<AgentHireResponse | null> {
  if (!hasSupabaseEnv()) return updateHireStatus(id, status);

  try {
    const sb = getSupabase();
    const rows = await sb.update<AgentHireRow>(
      "agent_hires",
      `id=eq.${encodeURIComponent(id)}`,
      {
        status,
        updated_at: nowIso(),
      },
    );
    return rows[0] ? fromRow(rows[0]) : null;
  } catch {
    return updateHireStatus(id, status);
  }
}

export async function listHireRecords(filters?: {
  operatorWallet?: string;
  agentId?: string;
}): Promise<AgentHireResponse[]> {
  if (!hasSupabaseEnv()) return listHires(filters);

  try {
    const filterParts: string[] = [];
    if (filters?.operatorWallet) {
      filterParts.push(`operator_wallet=eq.${encodeURIComponent(filters.operatorWallet)}`);
    }
    if (filters?.agentId) {
      filterParts.push(`agent_id=eq.${encodeURIComponent(filters.agentId)}`);
    }
    const sb = getSupabase();
    const rows = await sb.select<AgentHireRow>(
      "agent_hires",
      filterParts.join("&") || undefined,
      { orderBy: "created_at.desc", limit: 1000 },
    );
    return rows.map(fromRow);
  } catch {
    return listHires(filters);
  }
}
