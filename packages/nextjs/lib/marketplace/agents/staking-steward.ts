import type { AgentRuntimeHandler, AgentRuntimeInput } from "./types";
import { executeWithStarkZap } from "../starkzap-adapter";

const STAKING_ACTIONS = new Set(["stake", "unstake", "rebalance"]);

function ensureValidStakingAction(action: string): void {
  if (!STAKING_ACTIONS.has(action)) {
    throw new Error(`Unsupported staking action: ${action}`);
  }
}

function ensureRequiredParams(input: AgentRuntimeInput): void {
  if (input.action === "stake" || input.action === "unstake") {
    if (typeof input.params.amount !== "string") {
      throw new Error("staking amount is required");
    }
  }
  if (input.action === "rebalance") {
    if (
      typeof input.params.from_pool !== "string" ||
      typeof input.params.to_pool !== "string"
    ) {
      throw new Error("rebalance requires from_pool and to_pool");
    }
  }
}

export const stakingStewardRuntime: AgentRuntimeHandler = {
  type: "staking_steward",
  async execute(input) {
    try {
      ensureValidStakingAction(input.action);
      ensureRequiredParams(input);

      const execution = await executeWithStarkZap({
        agentType: input.agentType,
        action: input.action,
        params: input.params,
        operatorWallet: input.operatorWallet,
        serviceWallet: input.serviceWallet,
        protocol: "starkzap-staking",
      });

      return {
        status: "completed",
        executionTxHashes: execution.txHashes,
        result: {
          provider: execution.provider,
          protocol: "starkzap-staking",
          receipt: execution.receipt,
        },
      };
    } catch (error) {
      return {
        status: "failed",
        executionTxHashes: null,
        result: {
          error: error instanceof Error ? error.message : "staking runtime failed",
        },
      };
    }
  },
};

