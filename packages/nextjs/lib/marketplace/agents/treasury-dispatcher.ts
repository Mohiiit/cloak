import type { AgentRuntimeHandler, AgentRuntimeInput } from "./types";
import { executeWithStarkZap } from "../starkzap-adapter";

const TREASURY_ACTIONS = new Set(["dispatch_batch", "sweep_idle"]);

function ensureValidAction(action: string): void {
  if (!TREASURY_ACTIONS.has(action)) {
    throw new Error(`Unsupported treasury action: ${action}`);
  }
}

function ensureParams(input: AgentRuntimeInput): void {
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

      const execution = await executeWithStarkZap({
        agentType: input.agentType,
        action: input.action,
        params: input.params,
        operatorWallet: input.operatorWallet,
        serviceWallet: input.serviceWallet,
        protocol: "starkzap-treasury",
      });

      return {
        status: "completed",
        executionTxHashes: execution.txHashes,
        result: {
          provider: execution.provider,
          protocol: "starkzap-treasury",
          receipt: execution.receipt,
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

