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
  save(
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

export interface CloakRuntime {
  config: Readonly<{
    network: Network;
    flags: Readonly<Record<string, boolean>>;
  }>;
  deps: Readonly<CloakRuntimeDeps>;
  policy: CloakRuntimePolicyModule;
  approvals: CloakRuntimeApprovalsModule;
  transactions: CloakRuntimeTransactionsModule;
  ward: CloakRuntimeWardModule;
}
