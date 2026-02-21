import type { AmountUnit } from "../token-convert";
import type { TokenKey } from "../types";
import type {
  RouteExecutionResult,
  RouterCall,
  WardExecutionDecision,
  WardPolicySnapshot,
} from "../router";

export type SwapProvider = "avnu";
export type SwapMode = "exact_in";

export interface SwapPair {
  sellToken: TokenKey;
  buyToken: TokenKey;
}

export interface SwapAmount {
  value: string;
  unit: AmountUnit;
}

export interface SwapQuoteRequest {
  walletAddress: string;
  pair: SwapPair;
  sellAmount: SwapAmount;
  mode?: SwapMode;
  slippageBps?: number;
}

export interface SwapQuote {
  id: string;
  provider: SwapProvider;
  pair: SwapPair;
  mode: SwapMode;
  sellAmountWei: string;
  estimatedBuyAmountWei: string;
  minBuyAmountWei: string;
  expiresAt?: string | null;
  route: unknown;
  meta?: Record<string, unknown> | null;
}

export interface SwapBuildRequest {
  walletAddress: string;
  pair: SwapPair;
  quote: SwapQuote;
  receiverAddress?: string | null;
}

export interface ShieldedSwapPlan {
  provider: SwapProvider;
  pair: SwapPair;
  mode: SwapMode;
  quoteId: string;
  calls: RouterCall[];
  dexCalls: RouterCall[];
  sellAmount: SwapAmount;
  estimatedBuyAmountWei: string;
  minBuyAmountWei: string;
  meta?: Record<string, unknown> | null;
}

export interface SwapExecutionInput {
  walletAddress: string;
  plan: ShieldedSwapPlan;
  wardAddress?: string;
  is2FAEnabled?: boolean;
  onStatusChange?: (status: string) => void;
  confirmOnChain?: boolean;
  executeDirect: () => Promise<unknown>;
  execute2FA?: () => Promise<{ approved: boolean; txHash?: string; error?: string }>;
  executeWardApproval?: (
    decision: WardExecutionDecision,
    snapshot: WardPolicySnapshot,
  ) => Promise<{ approved: boolean; txHash?: string; error?: string }>;
}

export interface SwapExecutionResult extends RouteExecutionResult {
  plan: ShieldedSwapPlan;
}

export type SwapValidationErrorCode =
  | "INVALID_PAIR"
  | "INVALID_AMOUNT"
  | "INVALID_SLIPPAGE"
  | "INVALID_MODE";

export class SwapValidationError extends Error {
  readonly code: SwapValidationErrorCode;

  constructor(code: SwapValidationErrorCode, message: string) {
    super(message);
    this.name = "SwapValidationError";
    this.code = code;
  }
}

function parsePositiveInteger(value: string): bigint | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = BigInt(value);
  if (parsed <= 0n) return null;
  return parsed;
}

function isPositiveDisplayAmount(value: string): boolean {
  if (!/^\d+(\.\d+)?$/.test(value)) return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

export function normalizeSwapMode(mode?: SwapMode): SwapMode {
  if (mode == null) return "exact_in";
  if (mode === "exact_in") return mode;
  throw new SwapValidationError("INVALID_MODE", `Unsupported swap mode: ${String(mode)}`);
}

export function assertValidSwapPair(pair: SwapPair): void {
  if (!pair?.sellToken || !pair?.buyToken) {
    throw new SwapValidationError("INVALID_PAIR", "Swap pair requires sellToken and buyToken");
  }
  if (pair.sellToken === pair.buyToken) {
    throw new SwapValidationError("INVALID_PAIR", "sellToken and buyToken must be different");
  }
}

export function assertValidSwapAmount(amount: SwapAmount): void {
  if (!amount?.value || !amount?.unit) {
    throw new SwapValidationError("INVALID_AMOUNT", "Swap amount requires value and unit");
  }

  if (amount.unit === "erc20_display") {
    if (!isPositiveDisplayAmount(amount.value)) {
      throw new SwapValidationError(
        "INVALID_AMOUNT",
        "Display amount must be a positive decimal value",
      );
    }
    return;
  }

  if (parsePositiveInteger(amount.value) === null) {
    throw new SwapValidationError(
      "INVALID_AMOUNT",
      "Amount must be a positive integer for non-display units",
    );
  }
}

export function assertValidSlippageBps(slippageBps?: number): void {
  if (slippageBps == null) return;
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 5_000) {
    throw new SwapValidationError(
      "INVALID_SLIPPAGE",
      "slippageBps must be an integer between 1 and 5000",
    );
  }
}

export function assertValidSwapQuoteRequest(request: SwapQuoteRequest): SwapMode {
  if (!request?.walletAddress) {
    throw new SwapValidationError("INVALID_AMOUNT", "walletAddress is required");
  }
  assertValidSwapPair(request.pair);
  assertValidSwapAmount(request.sellAmount);
  assertValidSlippageBps(request.slippageBps);
  return normalizeSwapMode(request.mode);
}
