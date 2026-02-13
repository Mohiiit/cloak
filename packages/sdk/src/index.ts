// Core classes
export { CloakClient } from "./client";
export { CloakAccount } from "./account";

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
} from "./two-factor";
export type {
  TwoFactorAction,
  ApprovalStatus,
  TwoFactorConfig,
  ApprovalRequest,
} from "./two-factor";

// Supabase client
export { SupabaseLite } from "./supabase";

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
