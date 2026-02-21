import { convertAmount } from "../token-convert";
import type {
  RouterCall,
  WardExecutionDecision,
  WardPolicySnapshot,
} from "../router";
import type { TokenKey } from "../types";
import { composeShieldedSwapPlan } from "./builder";
import type { CloakSwapModule } from "./module";
import type {
  ShieldedSwapPlan,
  SwapAmount,
  SwapExecutionResult,
  SwapMode,
  SwapQuote,
} from "./types";

export interface SwapSourceAccountLike {
  prepareWithdraw(amount: bigint): Promise<{ calls: RouterCall[] }>;
}

export interface SwapDestinationAccountLike {
  prepareFund(amount: bigint): Promise<{ calls: RouterCall[] }>;
}

export interface ExecuteComposedShieldedSwapInput {
  walletAddress: string;
  sourceToken: TokenKey;
  destinationToken: TokenKey;
  sellAmount: SwapAmount;
  mode?: SwapMode;
  slippageBps?: number;
  receiverAddress?: string | null;
  sourceAccount: SwapSourceAccountLike;
  destinationAccount: SwapDestinationAccountLike;
  wardAddress?: string;
  is2FAEnabled?: boolean;
  network?: string;
  platform?: string | null;
  note?: string | null;
  onStatusChange?: (status: string) => void;
  confirmOnChain?: boolean;
  executeDirect: (calls: RouterCall[], plan: ShieldedSwapPlan) => Promise<unknown>;
  execute2FA?: (
    calls: RouterCall[],
    plan: ShieldedSwapPlan,
  ) => Promise<{ approved: boolean; txHash?: string; error?: string }>;
  executeWardApproval?: (
    decision: WardExecutionDecision,
    snapshot: WardPolicySnapshot,
    calls: RouterCall[],
    plan: ShieldedSwapPlan,
  ) => Promise<{ approved: boolean; txHash?: string; error?: string }>;
}

export interface ComposedShieldedSwapResult extends SwapExecutionResult {
  quote: SwapQuote;
  dexPlan: ShieldedSwapPlan;
  composedPlan: ShieldedSwapPlan;
  sellAmountTongoUnits: string;
  minBuyAmountTongoUnits: string;
}

export type ComposedShieldedSwapErrorCode = "SELL_AMOUNT_TOO_SMALL" | "MIN_BUY_TOO_SMALL";

export class ComposedShieldedSwapError extends Error {
  readonly code: ComposedShieldedSwapErrorCode;

  constructor(code: ComposedShieldedSwapErrorCode, message: string) {
    super(message);
    this.name = "ComposedShieldedSwapError";
    this.code = code;
  }
}

function weiToTongoUnits(value: string, token: TokenKey): bigint {
  return BigInt(
    convertAmount(
      {
        value,
        unit: "erc20_wei",
        token,
      },
      "tongo_units",
    ),
  );
}

function requirePositiveUnits(
  value: bigint,
  code: ComposedShieldedSwapErrorCode,
  message: string,
): bigint {
  if (value <= 0n) throw new ComposedShieldedSwapError(code, message);
  return value;
}

export async function executeComposedShieldedSwap(
  swaps: Pick<CloakSwapModule, "quote" | "build" | "execute">,
  input: ExecuteComposedShieldedSwapInput,
): Promise<ComposedShieldedSwapResult> {
  input.onStatusChange?.("Fetching swap quote...");
  const pair = {
    sellToken: input.sourceToken,
    buyToken: input.destinationToken,
  } as const;

  const quote = await swaps.quote({
    walletAddress: input.walletAddress,
    pair,
    sellAmount: input.sellAmount,
    mode: input.mode,
    slippageBps: input.slippageBps,
  });

  input.onStatusChange?.("Building swap route...");
  const dexPlan = await swaps.build({
    walletAddress: input.walletAddress,
    pair,
    quote,
    receiverAddress: input.receiverAddress || null,
  });

  input.onStatusChange?.("Preparing shielded boundaries...");
  const sellAmountTongoUnits = requirePositiveUnits(
    weiToTongoUnits(quote.sellAmountWei, input.sourceToken),
    "SELL_AMOUNT_TOO_SMALL",
    "Sell amount is too small to represent in source shielded units",
  );
  const minBuyAmountTongoUnits = requirePositiveUnits(
    weiToTongoUnits(dexPlan.minBuyAmountWei, input.destinationToken),
    "MIN_BUY_TOO_SMALL",
    "Minimum buy amount is too small to represent in destination shielded units",
  );

  const [withdrawPrepared, fundPrepared] = await Promise.all([
    input.sourceAccount.prepareWithdraw(sellAmountTongoUnits),
    input.destinationAccount.prepareFund(minBuyAmountTongoUnits),
  ]);

  const composedPlan = composeShieldedSwapPlan({
    dexPlan,
    withdrawCalls: withdrawPrepared.calls,
    fundCalls: fundPrepared.calls,
    sellAmount: input.sellAmount,
  });

  input.onStatusChange?.("Executing composed swap...");
  const execution = await swaps.execute({
    walletAddress: input.walletAddress,
    plan: composedPlan,
    wardAddress: input.wardAddress,
    is2FAEnabled: input.is2FAEnabled,
    network: input.network,
    platform: input.platform,
    note: input.note,
    onStatusChange: input.onStatusChange,
    confirmOnChain: input.confirmOnChain,
    executeDirect: () => input.executeDirect(composedPlan.calls, composedPlan),
    execute2FA: input.execute2FA
      ? () => input.execute2FA!(composedPlan.calls, composedPlan)
      : undefined,
    executeWardApproval: input.executeWardApproval
      ? (decision, snapshot) =>
          input.executeWardApproval!(decision, snapshot, composedPlan.calls, composedPlan)
      : undefined,
  });

  return {
    ...execution,
    quote,
    dexPlan,
    composedPlan,
    sellAmountTongoUnits: sellAmountTongoUnits.toString(),
    minBuyAmountTongoUnits: minBuyAmountTongoUnits.toString(),
  };
}
