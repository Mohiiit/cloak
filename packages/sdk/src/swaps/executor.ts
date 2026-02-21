import { orchestrateExecution } from "../router";
import type { OrchestratorDeps } from "../router";
import type { SwapExecutionInput, SwapExecutionResult } from "./types";

export interface ShieldedSwapExecutorDeps extends OrchestratorDeps {
  network?: string;
}

function defaultSwapNote(pair: { sellToken: string; buyToken: string }): string {
  return `Shielded swap ${pair.sellToken} -> ${pair.buyToken}`;
}

export async function executeShieldedSwap(
  deps: ShieldedSwapExecutorDeps,
  input: SwapExecutionInput,
): Promise<SwapExecutionResult> {
  const routeResult = await orchestrateExecution(deps, {
    walletAddress: input.walletAddress,
    wardAddress: input.wardAddress,
    calls: input.plan.calls,
    meta: {
      type: "shielded_swap",
      token: input.plan.pair.sellToken,
      amount: input.plan.sellAmount,
      note: input.note || defaultSwapNote(input.plan.pair),
      network: input.network || deps.network || "sepolia",
      platform: input.platform || null,
      directAccountType: "normal",
    },
    is2FAEnabled: input.is2FAEnabled,
    onStatusChange: input.onStatusChange,
    confirmOnChain: input.confirmOnChain,
    executeDirect: input.executeDirect,
    execute2FA: input.execute2FA,
    executeWardApproval: input.executeWardApproval,
  });

  return {
    ...routeResult,
    plan: input.plan,
  };
}
