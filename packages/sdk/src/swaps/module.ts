import {
  assertValidSwapPair,
  assertValidSwapQuoteRequest,
  SwapValidationError,
} from "./types";
import type {
  ShieldedSwapPlan,
  SwapBuildRequest,
  SwapExecutionInput,
  SwapExecutionResult,
  SwapQuote,
  SwapQuoteRequest,
} from "./types";

export interface CloakSwapModuleAdapter {
  quote(params: SwapQuoteRequest): Promise<SwapQuote>;
  build(params: SwapBuildRequest): Promise<ShieldedSwapPlan>;
  execute(params: SwapExecutionInput): Promise<SwapExecutionResult>;
}

export interface CloakSwapModule {
  quote(params: SwapQuoteRequest): Promise<SwapQuote>;
  build(params: SwapBuildRequest): Promise<ShieldedSwapPlan>;
  execute(params: SwapExecutionInput): Promise<SwapExecutionResult>;
}

export class SwapModuleNotConfiguredError extends Error {
  constructor() {
    super("Swap module adapter is not configured");
    this.name = "SwapModuleNotConfiguredError";
  }
}

function assertBuildInput(params: SwapBuildRequest): void {
  if (!params.walletAddress) {
    throw new SwapValidationError("INVALID_AMOUNT", "walletAddress is required");
  }
  assertValidSwapPair(params.pair);
  if (!params.quote) {
    throw new SwapValidationError("INVALID_AMOUNT", "quote is required");
  }
  if (
    params.pair.sellToken !== params.quote.pair.sellToken
    || params.pair.buyToken !== params.quote.pair.buyToken
  ) {
    throw new SwapValidationError("INVALID_PAIR", "build pair must match quote pair");
  }
}

function assertExecutionInput(params: SwapExecutionInput): void {
  if (!params.walletAddress) {
    throw new SwapValidationError("INVALID_AMOUNT", "walletAddress is required");
  }
  if (!params.plan) {
    throw new SwapValidationError("INVALID_AMOUNT", "plan is required");
  }
  assertValidSwapPair(params.plan.pair);
}

function createDefaultAdapter(): CloakSwapModuleAdapter {
  const fail = async (): Promise<never> => {
    throw new SwapModuleNotConfiguredError();
  };
  return {
    quote: fail,
    build: fail,
    execute: fail,
  };
}

export function createSwapModule(adapter?: CloakSwapModuleAdapter): CloakSwapModule {
  const resolved = adapter ?? createDefaultAdapter();

  return {
    async quote(params) {
      assertValidSwapQuoteRequest(params);
      return resolved.quote(params);
    },
    async build(params) {
      assertBuildInput(params);
      return resolved.build(params);
    },
    async execute(params) {
      assertExecutionInput(params);
      return resolved.execute(params);
    },
  };
}
