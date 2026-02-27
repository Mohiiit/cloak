import type { AgentType, SpendAuthorization, SpendAuthorizationEvidence } from "@cloak-wallet/sdk";

export interface DelegationContext {
  spendAuthorization: SpendAuthorization;
  evidence: SpendAuthorizationEvidence;
}

export interface AgentRuntimeInput {
  agentType: AgentType;
  action: string;
  params: Record<string, unknown>;
  operatorWallet: string;
  serviceWallet: string;
  delegationContext?: DelegationContext;
}

export interface AgentRuntimeOutput {
  status: "completed" | "failed";
  executionTxHashes: string[] | null;
  result: Record<string, unknown>;
}

export interface AgentRuntimeHandler {
  type: AgentType;
  execute(input: AgentRuntimeInput): Promise<AgentRuntimeOutput>;
}

