import type { RuntimeMode } from "../runtimeConfig";

export type TwoFactorAction = "fund" | "transfer" | "withdraw" | "rollover";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "failed"
  | "expired";

export interface TwoFactorConfigRecord {
  id: string;
  wallet_address: string;
  secondary_public_key: string;
  is_enabled: boolean;
  created_at: string;
}

export interface ApprovalRequestRecord {
  id: string;
  wallet_address: string;
  action: TwoFactorAction;
  token: string;
  amount: string | null;
  recipient: string | null;
  calls_json: string;
  sig1_json: string;
  nonce: string;
  resource_bounds_json: string;
  tx_hash: string;
  status: ApprovalStatus;
  final_tx_hash: string | null;
  error_message: string | null;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
}

export interface SupabaseLiteLike {
  insert<T = any>(table: string, data: Record<string, any>): Promise<T[]>;
  select<T = any>(table: string, filters?: string, orderBy?: string): Promise<T[]>;
  update<T = any>(
    table: string,
    filters: string,
    data: Record<string, any>,
  ): Promise<T[]>;
  delete(table: string, filters: string): Promise<void>;
  poll(
    table: string,
    filters: string,
    intervalMs: number,
    callback: (rows: any[]) => void,
  ): () => void;
}

export interface ApprovalBackend {
  readonly mode: RuntimeMode;

  getSupabaseLite(): Promise<SupabaseLiteLike>;
  fetchPendingRequests(walletAddress: string): Promise<ApprovalRequestRecord[]>;
  updateRequestStatus(
    id: string,
    status: ApprovalStatus,
    finalTxHash?: string,
    errorMessage?: string,
  ): Promise<any>;
  enableTwoFactorConfig(
    walletAddress: string,
    secondaryPubKey: string,
  ): Promise<any>;
  disableTwoFactorConfig(walletAddress: string): Promise<any>;
  isTwoFactorConfigured(walletAddress: string): Promise<TwoFactorConfigRecord | null>;
}
