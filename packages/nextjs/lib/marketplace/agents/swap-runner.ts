import type { AgentRuntimeHandler, AgentRuntimeInput } from "./types";
import { executeWithStarkZap } from "../starkzap-adapter";

const SWAP_ACTIONS = new Set(["swap", "dca_tick"]);

function ensureValidAction(action: string): void {
  if (!SWAP_ACTIONS.has(action)) {
    throw new Error(`Unsupported swap action: ${action}`);
  }
}

function ensureParams(input: AgentRuntimeInput): void {
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

      const execution = await executeWithStarkZap({
        agentType: input.agentType,
        action: input.action,
        params: input.params,
        operatorWallet: input.operatorWallet,
        serviceWallet: input.serviceWallet,
        protocol: "starkzap-swap",
      });

      return {
        status: "completed",
        executionTxHashes: execution.txHashes,
        result: {
          provider: execution.provider,
          protocol: "starkzap-swap",
          receipt: execution.receipt,
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

