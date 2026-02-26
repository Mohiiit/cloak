// Core classes
export { CloakClient } from "./client";
export { CloakAccount } from "./account";
export { createCloakRuntime } from "./runtime";
export type {
  RuntimeLogger,
  RuntimeNow,
  CloakRuntimeConfig,
  CloakRuntimeDeps,
  CloakRuntimePolicyModule,
  CloakRuntimeApprovalsModule,
  CloakRuntimeTransactionsModule,
  CloakRuntimeWardModule,
  CloakRuntimeSwapsModule,
  CloakRuntimeRepositories,
  CloakRuntimeRouterModule,
  CloakRuntime,
} from "./runtime";
export {
  parseSpendFromCalls,
  evaluateWardExecutionPolicy,
  fetchWardPolicySnapshot,
  orchestrateExecution,
} from "./router";
export type {
  WardPolicyReason,
  WardPolicySnapshot,
  RouterCall,
  WardExecutionDecision,
  RouteExecutionMeta,
  RouteExecutionInput,
  RouteExecutionResult,
  OrchestratorDeps,
} from "./router";
export {
  createSwapModule,
  SwapModuleNotConfiguredError,
  executeComposedShieldedSwap,
  ComposedShieldedSwapError,
  saveSwapExecution,
  updateSwapExecution,
  updateSwapExecutionByExecutionId,
  getSwapExecutions,
  getSwapExecutionSteps,
  upsertSwapExecutionStep,
  normalizeSwapMode,
  assertValidSwapPair,
  assertValidSwapAmount,
  assertValidSlippageBps,
  assertValidSwapQuoteRequest,
  SwapValidationError,
} from "./swaps";
export type {
  CloakSwapModule,
  CloakSwapModuleAdapter,
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
  SwapExecutionStatus,
  SwapExecutionRecord,
  SwapExecutionStepStatus,
  SwapExecutionStepKey,
  SwapExecutionStepRecord,
  SwapValidationErrorCode,
  SwapSourceAccountLike,
  SwapDestinationAccountLike,
  ExecuteComposedShieldedSwapInput,
  ComposedShieldedSwapResult,
  ComposedShieldedSwapErrorCode,
} from "./swaps";
export {
  TransactionsRepository,
  ApprovalsRepository,
  SwapsRepository,
} from "./repositories";
export type {
  CanonicalAmount,
  SaveTransactionInput,
  TwoFactorRequestStatus,
  WardRequestStatus,
  ApprovalPollOptions,
  WardApprovalPollOptions,
  SaveSwapExecutionInput,
} from "./repositories";

// Centralized config constants
export {
  DEFAULT_RPC,
  CLOAK_WARD_CLASS_HASH,
  STRK_ADDRESS,
} from "./config";

// Wallet utilities
export { computeAddress, computeMultiSigAddress, createWalletInfo, OZ_ACCOUNT_CLASS_HASH, CLOAK_ACCOUNT_CLASS_HASH } from "./wallet";

// Key utilities
export { generateKey, isValidKey, CURVE_ORDER } from "./keys";

// Address utilities
export { padAddress, truncateAddress, truncateTongoAddress, validateTongoAddress } from "./address";

// Token utilities
export { TOKENS, DEFAULT_TOKEN, getTokenBySymbol, formatTokenAmount, parseTokenAmount } from "./tokens";

// Token conversion mid-layer
export { convertAmount, toDisplayString, toTongoUnits, toErc20Wei } from "./token-convert";
export type { AmountUnit, TokenAmount } from "./token-convert";

// Presentation helpers (frontend-ready typed objects)
export {
  SUPPORTED_TOKENS,
  isTokenKey,
  normalizeTokenKey,
  isAmountUnit,
  stripTokenSuffix,
  sanitizeAmountValue,
  resolveAmountUnit,
  toTokenAmountView,
  quantizeToShieldedUnits,
  buildTokenBalanceView,
  buildPortfolioBalanceView,
  toActivityRecordView,
  toActivityRecordViews,
} from "./presentation";
export type {
  TokenAmountView,
  ShieldedQuantizationView,
  TokenBalanceInput,
  TokenBalanceView,
  PortfolioBalanceView,
  ActivitySwapView,
  ActivityRecordView,
} from "./presentation";

// Storage adapters
export { MemoryStorage } from "./storage/memory";
export { LocalStorageAdapter } from "./storage/localStorage";

// Errors
export {
  CloakError,
  WalletNotFoundError,
  InvalidKeyError,
  AccountNotDeployedError,
  InsufficientBalanceError,
  TransactionFailedError,
} from "./errors";

// Two-factor utilities
export {
  signTransactionHash,
  combinedSignature,
  serializeCalls,
  deserializeCalls,
  request2FAApproval,
} from "./two-factor";
export type {
  TwoFactorAction,
  ApprovalStatus,
  TwoFactorConfig,
  ApprovalRequest,
  TwoFAApprovalParams,
  TwoFAApprovalResult,
} from "./two-factor";

// Starknet ID helpers
export {
  StarknetIdClient,
  normalizeStarkName,
  isStarkName,
} from "./starknet-id";
export type { StarknetProfile, StarknetIdClientOptions } from "./starknet-id";

// ERC-8004 registry helpers
export {
  ERC8004Client,
  ERC8004_REGISTRIES,
  getERC8004Registries,
  getERC8004RegistryAddress,
} from "./erc8004";
export type {
  ERC8004RegistryType,
  ERC8004RegistrySet,
  ERC8004ClientOptions,
} from "./erc8004";
export {
  buildEndpointOwnershipDigest,
  createEndpointOwnershipProof,
} from "./marketplace-proof";
export {
  MarketplaceClient,
  createMarketplaceClient,
} from "./marketplace";
export type {
  MarketplaceClientOptions,
  UpdateAgentProfileInput,
  UpdateHireInput,
} from "./marketplace";
export {
  createMarketplaceSession,
  createMarketplaceSessionFromApiClient,
} from "./marketplace-session";
export type {
  MarketplaceSession,
  MarketplaceSessionOptions,
} from "./marketplace-session";

// x402 helpers
export {
  createContextHash,
  parseX402Challenge,
  createShieldedPaymentPayload,
  createShieldedPaymentPayloadWithProofProvider,
  encodeX402PaymentHeader,
  decodeX402PaymentHeader,
  extractX402PaymentPayload,
  x402Fetch,
  x402FetchWithProofProvider,
  payWithX402,
  StaticX402ProofProvider,
  X402FacilitatorClient,
  createShieldedFacilitatorClient,
  assertValidChallenge,
  assertValidPaymentPayload,
} from "./x402";
export type {
  X402Version,
  X402Scheme,
  X402ErrorCode,
  X402Challenge,
  X402PaymentPayload,
  X402VerifyResponse,
  X402SettleResponse,
  X402FetchOptions,
  X402FetchWithProofProviderOptions,
  X402ChallengeRequest,
  X402VerifyRequest,
  X402SettleRequest,
  X402FacilitatorClientOptions,
  X402ProofProviderInput,
  X402ProofProviderOutput,
  X402ProofProvider,
} from "./x402";

// Compliance helpers
export {
  grantViewingAccess,
  revokeViewingAccess,
  listViewingGrantsForOwner,
  listViewingGrantsForViewer,
  submitInnocenceProof,
  listInnocenceProofs,
} from "./compliance";
export type {
  ViewingGrantStatus,
  ViewingKeyGrant,
  InnocenceProof,
} from "./compliance";

// Ward utilities
export {
  checkIfWardAccount,
  fetchWardApprovalNeeds,
  fetchWardInfo,
  signHash,
  assembleWardSignature,
  getBlockGasPrices,
  estimateWardInvokeFee,
  buildResourceBoundsFromEstimate,
  buildWardResourceBounds,
  parseInsufficientGasError,
  serializeResourceBounds,
  deserializeResourceBounds,
  createWardApprovalRequest,
  getWardApprovalRequestById,
  updateWardApprovalRequest,
  listWardApprovalRequestsForGuardian,
  listWardApprovalRequestsForWard,
  toWardApprovalUiModel,
  requestWardApproval,
  normalizeAddress,
  formatWardAmount,
  formatFeeForUser,
  buildFeeRetryInfo,
  getProvider,
} from "./ward";
export type {
  WardApprovalNeeds,
  WardInfo,
  WardApprovalRequest,
  WardApprovalStatus,
  WardApprovalStage,
  WardApprovalVisibility,
  WardApprovalAmountView,
  WardApprovalUiModel,
  WardApprovalParams,
  WardApprovalUpdate,
  WardApprovalResult,
  BlockGasPrices,
  FeeEstimate,
  FeeRetryInfo,
} from "./ward";

// Transaction tracking
export {
  saveTransaction,
  updateTransactionStatus,
  getTransactions,
  confirmTransaction,
} from "./transactions";
export type {
  TransactionRecord,
  TransactionStatus,
  TransactionType,
  AccountType,
} from "./transactions";

// Activity feed
export {
  getActivityRecords,
} from "./activity";
export type {
  ActivityRecord,
  ActivitySource,
  ActivityStatus,
} from "./activity";

// Voice module
export {
  createVoiceModule,
  VoiceError,
  createSarvamAdapter,
  createWhisperAdapter,
  toBlob,
  base64ToUint8Array,
  uint8ArrayToBase64,
  validateAudioDuration,
  MIN_AUDIO_DURATION_MS,
  MAX_AUDIO_DURATION_MS,
  CODEC_MIME,
  CODEC_EXT,
  BCP47_TO_SARVAM,
  BCP47_TO_WHISPER,
  WHISPER_TO_BCP47,
  sarvamLangToBcp47,
  whisperLangToBcp47,
} from "./voice";
export type {
  CloakVoiceModule,
  VoiceModuleConfig,
  VoiceProviderAdapter,
  VoiceProviderCapabilities,
  TranscribeRequest,
  TranscribeResult,
  SynthesizeRequest,
  SynthesizeResult,
  AudioBlob,
  AudioCodec,
  VoiceLanguageCode,
  VoiceErrorCode,
  SarvamConfig,
  WhisperConfig,
} from "./voice";

// Types
export type {
  TokenKey,
  Network,
  TokenConfig,
  WalletInfo,
  ShieldedState,
  CloakEvent,
  CloakClientConfig,
  StorageAdapter,
} from "./types";

// API Client & Types
export { CloakApiClient, CloakApiError } from "./api-client";
export type {
  AuthRegisterRequest,
  AuthRegisterResponse,
  AuthVerifyResponse,
  TwoFactorStatusResponse,
  TwoFactorEnableRequest,
  CreateApprovalRequest,
  ApprovalResponse,
  UpdateApprovalRequest,
  ApprovalStatus as ApiApprovalStatus,
  CreateWardConfigRequest,
  WardConfigResponse,
  UpdateWardConfigRequest,
  WardStatus,
  CreateWardApprovalRequest as ApiCreateWardApprovalRequest,
  WardApprovalResponse as ApiWardApprovalResponse,
  UpdateWardApprovalRequest as ApiUpdateWardApprovalRequest,
  WardApprovalStatus as ApiWardApprovalStatus,
  SaveTransactionRequest,
  TransactionResponse,
  UpdateTransactionRequest,
  SaveSwapRequest,
  SwapResponse,
  UpdateSwapRequest,
  UpsertSwapStepRequest,
  SwapStepResponse,
  ActivityListResponse,
  ActivityRecordResponse,
  PushRegisterRequest,
  PushPlatform,
  CreateViewingGrantRequest,
  ViewingGrantResponse,
  CreateInnocenceProofRequest,
  InnocenceProofResponse,
  ApiError,
  ApiSuccess,
  PaginationParams,
} from "./types/api";
