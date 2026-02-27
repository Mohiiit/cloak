import type { AgentRunResponse } from "@cloak-wallet/sdk";
import { getSupabase } from "~~/app/api/v1/_lib/supabase";
import { createRun, getRun, listRuns, setRun, updateRun } from "./runs-store";
import {
  hasSupabaseEnv,
  nowIso,
  parseJsonArray,
  parseJsonObject,
  randomId,
} from "./repo-utils";

interface AgentRunRow {
  id: string;
  hire_id: string;
  agent_id: string;
  hire_operator_wallet: string | null;
  action: string;
  params: unknown;
  billable: boolean;
  status: AgentRunResponse["status"];
  payment_ref: string | null;
  settlement_tx_hash: string | null;
  payment_evidence: unknown;
  agent_trust_snapshot: unknown;
  execution_tx_hashes: unknown;
  delegation_evidence: unknown;
  result: unknown;
  created_at: string;
  updated_at: string | null;
}

function fromRow(row: AgentRunRow): AgentRunResponse {
  return {
    id: row.id,
    hire_id: row.hire_id,
    agent_id: row.agent_id,
    hire_operator_wallet: row.hire_operator_wallet,
    action: row.action,
    params: parseJsonObject(row.params),
    billable: !!row.billable,
    status: row.status,
    payment_ref: row.payment_ref,
    settlement_tx_hash: row.settlement_tx_hash,
    payment_evidence:
      parseJsonObject(row.payment_evidence) as unknown as AgentRunResponse["payment_evidence"],
    agent_trust_snapshot:
      parseJsonObject(row.agent_trust_snapshot) as unknown as AgentRunResponse["agent_trust_snapshot"],
    execution_tx_hashes: parseJsonArray(row.execution_tx_hashes),
    delegation_evidence:
      parseJsonObject(row.delegation_evidence) as unknown as AgentRunResponse["delegation_evidence"],
    result: parseJsonObject(row.result),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createRunRecord(input: {
  hireId: string;
  agentId: string;
  hireOperatorWallet?: string | null;
  action: string;
  params: Record<string, unknown>;
  billable: boolean;
  initialStatus?: AgentRunResponse["status"];
  paymentRef?: string | null;
  settlementTxHash?: string | null;
  agentTrustSnapshot?: AgentRunResponse["agent_trust_snapshot"];
}): Promise<AgentRunResponse> {
  if (!hasSupabaseEnv()) return createRun(input);

  const status = input.initialStatus ?? "queued";
  const row: AgentRunRow = {
    id: randomId("run"),
    hire_id: input.hireId,
    agent_id: input.agentId,
    hire_operator_wallet: input.hireOperatorWallet ?? null,
    action: input.action,
    params: input.params,
    billable: input.billable,
    status,
    payment_ref: input.paymentRef ?? null,
    settlement_tx_hash: input.settlementTxHash ?? null,
    payment_evidence: {
      scheme: input.billable ? "cloak-shielded-x402" : null,
      payment_ref: input.paymentRef ?? null,
      settlement_tx_hash: input.settlementTxHash ?? null,
      state:
        input.billable && status === "pending_payment"
          ? "pending_payment"
          : input.billable && input.paymentRef
            ? "settled"
            : input.billable
              ? "required"
              : null,
    },
    agent_trust_snapshot: (input.agentTrustSnapshot as unknown as Record<string, unknown>) ?? null,
    execution_tx_hashes: null,
    delegation_evidence: null,
    result: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  // Always write-through to in-memory so update/get fallbacks work even if
  // Supabase is available for create but fails on subsequent operations.
  const fallback = fromRow(row);
  setRun(fallback);

  try {
    const sb = getSupabase();
    const rows = await sb.insert<AgentRunRow>(
      "agent_runs",
      row as unknown as Record<string, unknown>,
    );
    const result = fromRow(rows[0] ?? row);
    setRun(result);
    return result;
  } catch {
    return fallback;
  }
}

export async function updateRunRecord(
  id: string,
  patch: Partial<AgentRunResponse>,
): Promise<AgentRunResponse | null> {
  // Always update in-memory first so the write-through cache stays current.
  const inMemResult = updateRun(id, patch);

  if (!hasSupabaseEnv()) return inMemResult;

  try {
    const sb = getSupabase();
    // Only send columns that exist in the agent_runs table to avoid
    // PostgREST errors on unknown fields.
    const dbPatch: Record<string, unknown> = { updated_at: nowIso() };
    const KNOWN_COLUMNS = new Set([
      "status", "execution_tx_hashes", "payment_evidence", "result",
      "payment_ref", "settlement_tx_hash", "agent_trust_snapshot",
      "delegation_evidence", "params", "billable", "action",
      "hire_operator_wallet",
    ]);
    for (const [key, value] of Object.entries(patch)) {
      if (KNOWN_COLUMNS.has(key)) {
        dbPatch[key] = value;
      }
    }
    const rows = await sb.update<AgentRunRow>(
      "agent_runs",
      `id=eq.${encodeURIComponent(id)}`,
      dbPatch,
    );
    if (rows[0]) {
      const result = fromRow(rows[0]);
      setRun(result);
      return result;
    }
    return inMemResult;
  } catch (err) {
    console.warn("[updateRunRecord] Supabase update failed, using in-memory:", err);
    return inMemResult;
  }
}

export async function getRunRecord(id: string): Promise<AgentRunResponse | null> {
  if (!hasSupabaseEnv()) return getRun(id);

  try {
    const sb = getSupabase();
    const rows = await sb.select<AgentRunRow>(
      "agent_runs",
      `id=eq.${encodeURIComponent(id)}`,
      { limit: 1 },
    );
    return rows[0] ? fromRow(rows[0]) : getRun(id);
  } catch {
    return getRun(id);
  }
}

export async function listRunRecords(filters?: {
  operatorWallet?: string;
  hireId?: string;
  agentId?: string;
  paymentRef?: string;
  status?: AgentRunResponse["status"];
  limit?: number;
  offset?: number;
}): Promise<AgentRunResponse[]> {
  if (!hasSupabaseEnv()) {
    const runs = listRuns();
    const filtered = runs
      .filter((run) => {
        if (filters?.operatorWallet && run.hire_operator_wallet !== filters.operatorWallet) {
          return false;
        }
        if (filters?.hireId && run.hire_id !== filters.hireId) return false;
        if (filters?.agentId && run.agent_id !== filters.agentId) return false;
        if (filters?.paymentRef && run.payment_ref !== filters.paymentRef) return false;
        if (filters?.status && run.status !== filters.status) return false;
        return true;
      });

    if (filters?.limit === undefined && filters?.offset === undefined) {
      return filtered;
    }
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;
    return filtered.slice(offset, offset + limit);
  }

  try {
    const parts: string[] = [];
    if (filters?.operatorWallet) {
      parts.push(`hire_operator_wallet=eq.${encodeURIComponent(filters.operatorWallet)}`);
    }
    if (filters?.hireId) {
      parts.push(`hire_id=eq.${encodeURIComponent(filters.hireId)}`);
    }
    if (filters?.agentId) {
      parts.push(`agent_id=eq.${encodeURIComponent(filters.agentId)}`);
    }
    if (filters?.paymentRef) {
      parts.push(`payment_ref=eq.${encodeURIComponent(filters.paymentRef)}`);
    }
    if (filters?.status) {
      parts.push(`status=eq.${encodeURIComponent(filters.status)}`);
    }
    const sb = getSupabase();
    const rows = await sb.select<AgentRunRow>(
      "agent_runs",
      parts.join("&") || undefined,
      {
        orderBy: "created_at.desc",
        limit: filters?.limit ?? 1000,
        offset: filters?.offset ?? 0,
      },
    );
    return rows.map(fromRow);
  } catch {
    const runs = listRuns();
    return runs.filter((run) => {
      if (filters?.operatorWallet && run.hire_operator_wallet !== filters.operatorWallet) {
        return false;
      }
      if (filters?.hireId && run.hire_id !== filters.hireId) return false;
      if (filters?.agentId && run.agent_id !== filters.agentId) return false;
      if (filters?.paymentRef && run.payment_ref !== filters.paymentRef) return false;
      if (filters?.status && run.status !== filters.status) return false;
      return true;
    });
  }
}
