import type { AgentRuntimeHandler, AgentRuntimeInput } from "./types";
import { executeMarketplaceRuntimeAction } from "../execution-adapter";

const STAKING_ACTIONS = new Set(["stake", "unstake", "rebalance", "compound"]);

function ensureValidStakingAction(action: string): void {
  if (!STAKING_ACTIONS.has(action)) {
    throw new Error(`Unsupported staking action: ${action}`);
  }
}

function ensureRequiredParams(input: AgentRuntimeInput): void {
  if (Array.isArray(input.params.calls) && input.params.calls.length > 0) {
    return;
  }

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

      // Compound has no user-provided required params — reads from chain
      if (input.action !== "compound") {
        ensureRequiredParams(input);
      }

      // Delegation was already validated and consumed at the route level
      // (consumeSpendAuthorization). Skip preflight to avoid double-consume.

      const execution = await executeMarketplaceRuntimeAction({
        agentType: input.agentType,
        action: input.action,
        params: {
          ...input.params,
          // For compound, pass operator wallet so the adapter can read staker_info
          ...(input.action === "compound"
            ? { token: input.params.token || "STRK" }
            : {}),
        },
        operatorWallet: input.operatorWallet,
        serviceWallet: input.serviceWallet,
        protocol: "staking",
      });

      const protocolPrefix =
        execution.provider === "starkzap" ? "starkzap" : "basic";

      return {
        status: "completed",
        executionTxHashes: execution.txHashes,
        result: {
          provider: execution.provider,
          protocol: `${protocolPrefix}-staking`,
          receipt: execution.receipt,
          ...(input.action === "compound" && execution.receipt
            ? {
                summary: `Compounded ${execution.receipt.compounded_display || "rewards"} STRK`,
                unclaimed_rewards_wei: execution.receipt.unclaimed_rewards_wei,
                compounded_amount_wei: execution.receipt.compounded_amount_wei,
                total_staked_after_wei: execution.receipt.total_staked_after_wei,
              }
            : {}),
          ...(input.delegationContext
            ? { delegation_evidence: input.delegationContext.evidence }
            : {}),
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "staking runtime failed";
      console.error("[staking-steward] execution failed:", errorMsg);
      return {
        status: "failed",
        executionTxHashes: null,
        result: {
          error: errorMsg,
        },
      };
    }
  },
};
