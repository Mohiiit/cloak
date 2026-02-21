import type { RouterCall } from "../router";
import type { ShieldedSwapPlan, SwapAmount } from "./types";

export interface ComposeShieldedSwapPlanInput {
  dexPlan: ShieldedSwapPlan;
  withdrawCalls: RouterCall[];
  fundCalls: RouterCall[];
  sellAmount?: SwapAmount;
}

export class SwapPlanComposeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwapPlanComposeError";
  }
}

function normalizeCalls(calls: RouterCall[]): RouterCall[] {
  return calls.map((call) => ({
    contractAddress: call.contractAddress || call.contract_address || call.to,
    entrypoint: call.entrypoint || call.entry_point || call.selector,
    calldata: Array.isArray(call.calldata) ? [...call.calldata] : [],
  }));
}

function assertNonEmptyCallSet(name: string, calls: RouterCall[]): void {
  if (!Array.isArray(calls) || calls.length === 0) {
    throw new SwapPlanComposeError(`${name} must contain at least one call`);
  }
}

function assertDexPlan(plan: ShieldedSwapPlan): void {
  if (!plan) throw new SwapPlanComposeError("dexPlan is required");
  if (!Array.isArray(plan.dexCalls) || plan.dexCalls.length === 0) {
    throw new SwapPlanComposeError("dexPlan must include dexCalls");
  }
}

export function composeShieldedSwapPlan(
  input: ComposeShieldedSwapPlanInput,
): ShieldedSwapPlan {
  assertDexPlan(input.dexPlan);
  assertNonEmptyCallSet("withdrawCalls", input.withdrawCalls);
  assertNonEmptyCallSet("fundCalls", input.fundCalls);

  const withdrawCalls = normalizeCalls(input.withdrawCalls);
  const dexCalls = normalizeCalls(input.dexPlan.dexCalls);
  const fundCalls = normalizeCalls(input.fundCalls);
  const calls = [...withdrawCalls, ...dexCalls, ...fundCalls];

  if (calls.length < 3) {
    throw new SwapPlanComposeError(
      "composed swap plan must contain withdraw, dex, and fund call sets",
    );
  }

  return {
    ...input.dexPlan,
    sellAmount: input.sellAmount ?? input.dexPlan.sellAmount,
    calls,
    dexCalls,
    meta: {
      ...(input.dexPlan.meta || {}),
      composed: true,
      callSetSizes: {
        withdraw: withdrawCalls.length,
        dex: dexCalls.length,
        fund: fundCalls.length,
      },
    },
  };
}
