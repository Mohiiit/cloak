import type { AgentRuntimeHandler, AgentRuntimeInput } from "./types";
import { executeMarketplaceRuntimeAction } from "../execution-adapter";

const SWAP_ACTIONS = new Set(["swap", "dca_tick"]);

function ensureValidAction(action: string): void {
  if (!SWAP_ACTIONS.has(action)) {
    throw new Error(`Unsupported swap action: ${action}`);
  }
}

function ensureParams(input: AgentRuntimeInput): void {
  if (Array.isArray(input.params.calls) && input.params.calls.length > 0) {
    return;
  }

  if (input.action === "swap") {
    if (
      typeof input.params.from_token !== "string" ||
      typeof input.params.to_token !== "string" ||
      typeof input.params.amount !== "string"
    ) {
      throw new Error("swap requires from_token, to_token and amount");
    }
  }
  if (input.action === "dca_tick") {
    if (typeof input.params.strategy_id !== "string") {
      throw new Error("dca_tick requires strategy_id");
    }
  }
}

export const swapRunnerRuntime: AgentRuntimeHandler = {
  type: "swap_runner",
  async execute(input) {
    try {
      ensureValidAction(input.action);
      ensureParams(input);

      const execution = await executeMarketplaceRuntimeAction({
        agentType: input.agentType,
        action: input.action,
        params: input.params,
        operatorWallet: input.operatorWallet,
        serviceWallet: input.serviceWallet,
        protocol: "swap",
      });

      const protocolPrefix =
        execution.provider === "starkzap" ? "starkzap" : "basic";

      return {
        status: "completed",
        executionTxHashes: execution.txHashes,
        result: {
          provider: execution.provider,
          protocol: `${protocolPrefix}-swap`,
          receipt: execution.receipt,
          ...(input.delegationContext
            ? { delegation_evidence: input.delegationContext.evidence }
            : {}),
        },
      };
    } catch (error) {
      return {
        status: "failed",
        executionTxHashes: null,
        result: {
          error: error instanceof Error ? error.message : "swap runtime failed",
        },
      };
    }
  },
};
