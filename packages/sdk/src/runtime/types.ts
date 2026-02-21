import type { RpcProvider } from "starknet";
import type { StorageAdapter, Network } from "../types";
import type { SupabaseLite } from "../supabase";
import type {
  TwoFAApprovalParams,
  TwoFAApprovalResult,
} from "../two-factor";
import type {
  WardApprovalParams,
  WardApprovalResult,
  WardApprovalRequestOptions,
  WardApprovalNeeds,
  WardInfo,
  BlockGasPrices,
  FeeEstimate,
} from "../ward";
import type {
  TransactionRecord,
  TransactionStatus,
} from "../transactions";
import type {
  SaveTransactionInput,
  TransactionsRepository,
  ApprovalsRepository,
  SwapsRepository,
} from "../repositories";
import type {
  WardPolicySnapshot,
  WardExecutionDecision,
  RouterCall,
  RouteExecutionInput,
  RouteExecutionResult,
} from "../router";
import type {
  CloakSwapModuleAdapter,
  ComposedShieldedSwapResult,
  ExecuteComposedShieldedSwapInput,
  SwapBuildRequest,
  SwapExecutionInput,
  SwapExecutionResult,
  SwapQuote,
  SwapQuoteRequest,
  ShieldedSwapPlan,
} from "../swaps";

export interface RuntimeLogger {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export type RuntimeNow = () => number;

export interface CloakRuntimeConfig {
  network?: Network;
  rpcUrl?: string;
  provider?: RpcProvider;
  supabase?: SupabaseLite;
  supabaseUrl?: string;
  supabaseKey?: string;
  swapsAdapter?: CloakSwapModuleAdapter;
  storage?: StorageAdapter;
  logger?: RuntimeLogger;
  now?: RuntimeNow;
  flags?: Record<string, boolean>;
}

export interface CloakRuntimeDeps {
  provider: RpcProvider;
  supabase: SupabaseLite;
  storage: StorageAdapter;
  logger: RuntimeLogger;
  now: RuntimeNow;
}

export interface CloakRuntimePolicyModule {
  getWardPolicySnapshot(wardAddress: string): Promise<WardPolicySnapshot | null>;
  evaluateWardExecutionPolicy(
    wardAddress: string,
    calls: RouterCall[],
  ): Promise<WardExecutionDecision | null>;
  // Legacy-friendly reads while migration is in progress.
  getWardApprovalNeeds(wardAddress: string): Promise<WardApprovalNeeds | null>;
  getWardInfo(wardAddress: string): Promise<WardInfo | null>;
}

export interface CloakRuntimeApprovalsModule {
  request2FAApproval(
    params: TwoFAApprovalParams,
    onStatusChange?: (status: string) => void,
    signal?: AbortSignal,
  ): Promise<TwoFAApprovalResult>;
  requestWardApproval(
    params: WardApprovalParams,
    onStatusChange?: (status: string) => void,
    signal?: AbortSignal,
    options?: WardApprovalRequestOptions,
  ): Promise<WardApprovalResult>;
}

export interface CloakRuntimeTransactionsModule {
  save(record: SaveTransactionInput): Promise<TransactionRecord | null>;
  saveLegacy(
    record: Omit<TransactionRecord, "id" | "created_at">,
  ): Promise<TransactionRecord | null>;
  updateStatus(
    txHash: string,
    status: TransactionStatus,
    errorMessage?: string,
    fee?: string,
  ): Promise<void>;
  listByWallet(walletAddress: string, limit?: number): Promise<TransactionRecord[]>;
  confirm(txHash: string): Promise<void>;
}

export interface CloakRuntimeWardModule {
  checkIfWardAccount(address: string): Promise<boolean>;
  fetchApprovalNeeds(wardAddress: string): Promise<WardApprovalNeeds | null>;
  fetchInfo(wardAddress: string): Promise<WardInfo | null>;
  getBlockGasPrices(): Promise<BlockGasPrices>;
  estimateInvokeFee(senderAddress: string, calls: any[]): Promise<FeeEstimate>;
}

export interface CloakRuntimeSwapsModule {
  quote(params: SwapQuoteRequest): Promise<SwapQuote>;
  build(params: SwapBuildRequest): Promise<ShieldedSwapPlan>;
  execute(params: SwapExecutionInput): Promise<SwapExecutionResult>;
  executeComposed(
    params: ExecuteComposedShieldedSwapInput,
  ): Promise<ComposedShieldedSwapResult>;
}

export interface CloakRuntimeRepositories {
  approvals: ApprovalsRepository;
  transactions: TransactionsRepository;
  swaps: SwapsRepository;
}

export interface CloakRuntimeRouterModule {
  execute(input: RouteExecutionInput): Promise<RouteExecutionResult>;
}

export interface CloakRuntime {
  config: Readonly<{
    network: Network;
    flags: Readonly<Record<string, boolean>>;
  }>;
  deps: Readonly<CloakRuntimeDeps>;
  repositories: CloakRuntimeRepositories;
  router: CloakRuntimeRouterModule;
  policy: CloakRuntimePolicyModule;
  approvals: CloakRuntimeApprovalsModule;
  transactions: CloakRuntimeTransactionsModule;
  ward: CloakRuntimeWardModule;
  swaps: CloakRuntimeSwapsModule;
}
