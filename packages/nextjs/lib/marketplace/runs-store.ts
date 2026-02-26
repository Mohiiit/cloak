import type { AgentRunResponse } from "@cloak-wallet/sdk";

const inMemoryRuns = new Map<string, AgentRunResponse>();

function nowIso(): string {
  return new Date().toISOString();
}

export function createRun(input: {
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
}): AgentRunResponse {
  const id = `run_${Math.random().toString(16).slice(2)}`;
  const status = input.initialStatus ?? "queued";
  const run: AgentRunResponse = {
    id,
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
    agent_trust_snapshot: input.agentTrustSnapshot ?? null,
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

export function clearRunsStore(): void {
  inMemoryRuns.clear();
}
