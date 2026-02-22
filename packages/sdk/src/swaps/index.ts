export { createSwapModule, SwapModuleNotConfiguredError } from "./module";
export type { CloakSwapModule, CloakSwapModuleAdapter } from "./module";
export {
  composeShieldedSwapPlan,
  SwapPlanComposeError,
} from "./builder";
export type {
  ComposeShieldedSwapPlanInput,
} from "./builder";
export {
  executeComposedShieldedSwap,
  ComposedShieldedSwapError,
} from "./composed";
export type {
  SwapSourceAccountLike,
  SwapDestinationAccountLike,
  ExecuteComposedShieldedSwapInput,
  ComposedShieldedSwapResult,
  ComposedShieldedSwapErrorCode,
} from "./composed";
export {
  executeShieldedSwap,
} from "./executor";
export type {
  ShieldedSwapExecutorDeps,
} from "./executor";
export {
  saveSwapExecution,
  updateSwapExecution,
  updateSwapExecutionByExecutionId,
  getSwapExecutions,
  getSwapExecutionSteps,
  upsertSwapExecutionStep,
} from "./storage";
export type {
  SwapExecutionStatus,
  SwapExecutionStepStatus,
  SwapExecutionStepKey,
  SwapExecutionRecord,
  SwapExecutionStepRecord,
} from "./storage";
export {
  AVNU_BASE_URL,
  AVNU_BASE_URL_BY_NETWORK,
  AvnuSwapApiError,
  AvnuSwapStaleQuoteError,
  createAvnuSwapAdapter,
} from "./avnu";
export type {
  AvnuSwapApiConfig,
} from "./avnu";

export {
  normalizeSwapMode,
  assertValidSwapPair,
  assertValidSwapAmount,
  assertValidSlippageBps,
  assertValidSwapQuoteRequest,
  SwapValidationError,
} from "./types";
export type {
  SwapProvider,
  SwapMode,
  SwapPair,
  SwapAmount,
  SwapQuoteRequest,
  SwapQuote,
  SwapBuildRequest,
  ShieldedSwapPlan,
  SwapExecutionInput,
  SwapExecutionResult,
  SwapValidationErrorCode,
} from "./types";
