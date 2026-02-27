import type { AgentRuntimeHandler, AgentRuntimeInput } from "./types";
import { executeMarketplaceRuntimeAction } from "../execution-adapter";

const TREASURY_ACTIONS = new Set(["dispatch_batch", "sweep_idle"]);

function ensureValidAction(action: string): void {
  if (!TREASURY_ACTIONS.has(action)) {
    throw new Error(`Unsupported treasury action: ${action}`);
  }
}

function ensureParams(input: AgentRuntimeInput): void {
  if (Array.isArray(input.params.calls) && input.params.calls.length > 0) {
    return;
  }

  if (input.action === "dispatch_batch") {
    if (!Array.isArray(input.params.transfers) || input.params.transfers.length === 0) {
      throw new Error("dispatch_batch requires transfers");
    }
  }
  if (input.action === "sweep_idle") {
    if (typeof input.params.target_vault !== "string") {
      throw new Error("sweep_idle requires target_vault");
    }
  }
}

export const treasuryDispatcherRuntime: AgentRuntimeHandler = {
  type: "treasury_dispatcher",
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
        protocol: "treasury",
      });

      const protocolPrefix =
        execution.provider === "starkzap" ? "starkzap" : "basic";

      return {
        status: "completed",
        executionTxHashes: execution.txHashes,
        result: {
          provider: execution.provider,
          protocol: `${protocolPrefix}-treasury`,
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
          error: error instanceof Error ? error.message : "treasury runtime failed",
        },
      };
    }
  },
};
