import type {
  AgentHireResponse,
  AgentHireStatus,
  CreateAgentHireRequest,
} from "@cloak-wallet/sdk";

const inMemoryHires = new Map<string, AgentHireResponse>();

function nowIso(): string {
  return new Date().toISOString();
}

function createHireId(): string {
  return `hire_${Math.random().toString(16).slice(2)}`;
}

export function createHire(input: CreateAgentHireRequest): AgentHireResponse {
  const id = createHireId();
  const hire: AgentHireResponse = {
    id,
    agent_id: input.agent_id,
    operator_wallet: input.operator_wallet,
    policy_snapshot: input.policy_snapshot,
    billing_mode: input.billing_mode,
    status: "active",
    created_at: nowIso(),
    updated_at: null,
  };
  inMemoryHires.set(id, hire);
  return hire;
}

export function getHire(id: string): AgentHireResponse | null {
  return inMemoryHires.get(id) ?? null;
}

export function updateHireStatus(
  id: string,
  status: AgentHireStatus,
): AgentHireResponse | null {
  const existing = inMemoryHires.get(id);
  if (!existing) return null;
  const updated: AgentHireResponse = {
    ...existing,
    status,
    updated_at: nowIso(),
  };
  inMemoryHires.set(id, updated);
  return updated;
}

export function listHires(filters?: {
  operatorWallet?: string;
  agentId?: string;
}): AgentHireResponse[] {
  return [...inMemoryHires.values()]
    .filter((hire) => {
      if (filters?.operatorWallet && hire.operator_wallet !== filters.operatorWallet) {
        return false;
      }
      if (filters?.agentId && hire.agent_id !== filters.agentId) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function clearHires(): void {
  inMemoryHires.clear();
}

