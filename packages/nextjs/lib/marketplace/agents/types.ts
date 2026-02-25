import type { AgentType } from "@cloak-wallet/sdk";

export interface AgentRuntimeInput {
  agentType: AgentType;
  action: string;
  params: Record<string, unknown>;
  operatorWallet: string;
  serviceWallet: string;
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

