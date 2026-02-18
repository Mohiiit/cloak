// Core classes
export { CloakClient } from "./client";
export { CloakAccount } from "./account";

// Centralized config constants
export {
  DEFAULT_RPC,
  CLOAK_WARD_CLASS_HASH,
  STRK_ADDRESS,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_KEY,
} from "./config";

// Wallet utilities
export { computeAddress, computeMultiSigAddress, createWalletInfo, OZ_ACCOUNT_CLASS_HASH, CLOAK_ACCOUNT_CLASS_HASH } from "./wallet";

// Key utilities
export { generateKey, isValidKey, CURVE_ORDER } from "./keys";

// Address utilities
export { padAddress, truncateAddress, truncateTongoAddress, validateTongoAddress } from "./address";

// Token utilities
export { TOKENS, DEFAULT_TOKEN, getTokenBySymbol, formatTokenAmount, parseTokenAmount } from "./tokens";

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

// Supabase client
export { SupabaseLite } from "./supabase";

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
  WardApprovalParams,
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
