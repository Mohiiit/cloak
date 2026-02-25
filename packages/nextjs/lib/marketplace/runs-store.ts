import type { AgentRunResponse } from "@cloak-wallet/sdk";

const inMemoryRuns = new Map<string, AgentRunResponse>();

function nowIso(): string {
  return new Date().toISOString();
}

export function createRun(input: {
  hireId: string;
  agentId: string;
  action: string;
  params: Record<string, unknown>;
  billable: boolean;
  paymentRef?: string | null;
  settlementTxHash?: string | null;
}): AgentRunResponse {
  const id = `run_${Math.random().toString(16).slice(2)}`;
  const run: AgentRunResponse = {
    id,
    hire_id: input.hireId,
    agent_id: input.agentId,
    action: input.action,
    params: input.params,
    billable: input.billable,
    status: "queued",
    payment_ref: input.paymentRef ?? null,
    settlement_tx_hash: input.settlementTxHash ?? null,
    execution_tx_hashes: null,
    result: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  inMemoryRuns.set(id, run);
  return run;
}

export function updateRun(
  id: string,
  patch: Partial<AgentRunResponse>,
): AgentRunResponse | null {
  const existing = inMemoryRuns.get(id);
  if (!existing) return null;
  const updated: AgentRunResponse = {
    ...existing,
    ...patch,
    updated_at: nowIso(),
  };
  inMemoryRuns.set(id, updated);
  return updated;
}

export function getRun(id: string): AgentRunResponse | null {
  return inMemoryRuns.get(id) ?? null;
}

export function listRuns(): AgentRunResponse[] {
  return [...inMemoryRuns.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

