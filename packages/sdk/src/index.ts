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

// Token conversion mid-layer
export { convertAmount, toDisplayString, toTongoUnits, toErc20Wei } from "./token-convert";
export type { AmountUnit, TokenAmount } from "./token-convert";

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
  ComplianceTables,
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
