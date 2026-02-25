/**
 * Shared API types for the Cloak Backend.
 *
 * These types define the contract between all frontends (web, extension, mobile)
 * and the centralized backend API. Both the CloakApiClient and the API route
 * handlers import from this single source of truth.
 */

import type { AmountUnit } from "../token-convert";

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthRegisterRequest {
  wallet_address: string;
  public_key: string;
}

export interface AuthRegisterResponse {
  api_key: string;
}

export interface AuthVerifyResponse {
  valid: boolean;
  wallet_address: string;
}

// ─── Two-Factor ──────────────────────────────────────────────────────────────

export interface TwoFactorStatusResponse {
  enabled: boolean;
  wallet_address?: string;
  secondary_public_key?: string;
}

export interface TwoFactorEnableRequest {
  wallet_address: string;
  secondary_public_key: string;
}

// ─── Approval Requests (2FA) ─────────────────────────────────────────────────

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "failed"
  | "expired";

export interface CreateApprovalRequest {
  wallet_address: string;
  action: string;
  token: string;
  amount: string | null;
  recipient: string | null;
  calls_json: string;
  sig1_json: string;
  nonce: string;
  resource_bounds_json: string;
  tx_hash: string;
}

export interface ApprovalResponse {
  id: string;
  wallet_address: string;
  action: string;
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

export interface UpdateApprovalRequest {
  status: ApprovalStatus;
  final_tx_hash?: string | null;
  error_message?: string | null;
}

// ─── Ward Configs ────────────────────────────────────────────────────────────

export type WardStatus = "active" | "frozen" | "removed";

export interface CreateWardConfigRequest {
  ward_address: string;
  guardian_address: string;
  ward_public_key: string;
  guardian_public_key: string;
  spending_limit_per_tx?: string | null;
  max_per_tx?: string | null;
  pseudo_name?: string | null;
}

export interface WardConfigResponse {
  id?: string;
  ward_address: string;
  guardian_address: string;
  ward_public_key: string;
  guardian_public_key: string;
  status: WardStatus;
  spending_limit_per_tx: string | null;
  max_per_tx: string | null;
  pseudo_name: string | null;
  require_guardian_for_all: boolean;
  created_at: string;
}

export interface UpdateWardConfigRequest {
  status?: WardStatus;
  spending_limit_per_tx?: string | null;
  require_guardian_for_all?: boolean;
}

// ─── Ward Approval Requests ──────────────────────────────────────────────────

export type WardApprovalStatus =
  | "pending_ward_sig"
  | "pending_guardian"
  | "approved"
  | "rejected"
  | "failed"
  | "gas_error"
  | "expired";

export interface CreateWardApprovalRequest {
  ward_address: string;
  guardian_address: string;
  action: string;
  token: string;
  amount: string | null;
  amount_unit?: AmountUnit | null;
  recipient: string | null;
  calls_json: string;
  nonce: string;
  resource_bounds_json: string;
  tx_hash: string;
  ward_sig_json: string;
  needs_ward_2fa: boolean;
  needs_guardian: boolean;
  needs_guardian_2fa: boolean;
  initial_status?: "pending_ward_sig" | "pending_guardian";
}

export interface WardApprovalResponse {
  id: string;
  ward_address: string;
  guardian_address: string;
  action: string;
  token: string;
  amount: string | null;
  amount_unit: AmountUnit | null;
  recipient: string | null;
  calls_json: string;
  nonce: string;
  resource_bounds_json: string;
  tx_hash: string;
  ward_sig_json: string | null;
  ward_2fa_sig_json: string | null;
  guardian_sig_json: string | null;
  guardian_2fa_sig_json: string | null;
  needs_ward_2fa: boolean;
  needs_guardian: boolean;
  needs_guardian_2fa: boolean;
  status: WardApprovalStatus;
  final_tx_hash: string | null;
  error_message: string | null;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
}

export interface UpdateWardApprovalRequest {
  status: WardApprovalStatus;
  nonce?: string | null;
  resource_bounds_json?: string | null;
  tx_hash?: string | null;
  ward_sig_json?: string | null;
  ward_2fa_sig_json?: string | null;
  guardian_sig_json?: string | null;
  guardian_2fa_sig_json?: string | null;
  final_tx_hash?: string | null;
  error_message?: string | null;
  responded_at?: string | null;
}

// ─── Transactions ────────────────────────────────────────────────────────────

export type TransactionStatus = "pending" | "confirmed" | "failed";
export type TransactionType =
  | "fund"
  | "transfer"
  | "withdraw"
  | "rollover"
  | "erc20_transfer"
  | "deploy_ward"
  | "fund_ward"
  | "configure_ward"
  | "shielded_swap";
export type AccountType = "normal" | "ward" | "guardian";

export interface SaveTransactionRequest {
  wallet_address: string;
  tx_hash: string;
  type: string;
  token: string;
  amount?: string | null;
  amount_unit?: AmountUnit | null;
  recipient?: string | null;
  recipient_name?: string | null;
  note?: string | null;
  status: TransactionStatus;
  error_message?: string | null;
  account_type: AccountType;
  ward_address?: string | null;
  fee?: string | null;
  network: string;
  platform?: string | null;
}

export interface TransactionResponse {
  id: string;
  wallet_address: string;
  tx_hash: string;
  type: string;
  token: string;
  amount: string | null;
  amount_unit: AmountUnit | null;
  recipient: string | null;
  recipient_name: string | null;
  note: string | null;
  status: TransactionStatus;
  error_message: string | null;
  account_type: AccountType;
  ward_address: string | null;
  fee: string | null;
  network: string;
  platform: string | null;
  created_at: string;
}

export interface UpdateTransactionRequest {
  status: TransactionStatus;
  error_message?: string | null;
  fee?: string | null;
}

// ─── Swaps ───────────────────────────────────────────────────────────────────

export type SwapExecutionStatus = "pending" | "running" | "confirmed" | "failed";
export type SwapStepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface SaveSwapRequest {
  execution_id: string;
  wallet_address: string;
  ward_address?: string | null;
  tx_hash?: string | null;
  primary_tx_hash?: string | null;
  tx_hashes?: string[] | null;
  provider: string;
  sell_token: string;
  buy_token: string;
  sell_amount_wei: string;
  estimated_buy_amount_wei: string;
  min_buy_amount_wei: string;
  buy_actual_amount_wei?: string | null;
  failure_step_key?: string | null;
  failure_reason?: string | null;
  route_meta?: Record<string, unknown> | null;
  status: SwapExecutionStatus;
  error_message?: string | null;
}

export interface SwapResponse {
  id: string;
  execution_id: string;
  wallet_address: string;
  ward_address: string | null;
  tx_hash: string | null;
  primary_tx_hash: string | null;
  tx_hashes: string[] | null;
  provider: string;
  sell_token: string;
  buy_token: string;
  sell_amount_wei: string;
  estimated_buy_amount_wei: string;
  min_buy_amount_wei: string;
  buy_actual_amount_wei: string | null;
  failure_step_key: string | null;
  failure_reason: string | null;
  route_meta: Record<string, unknown> | null;
  status: SwapExecutionStatus;
  error_message: string | null;
  created_at: string;
}

export interface UpdateSwapRequest {
  status?: SwapExecutionStatus;
  tx_hash?: string | null;
  primary_tx_hash?: string | null;
  tx_hashes?: string[] | null;
  buy_actual_amount_wei?: string | null;
  failure_step_key?: string | null;
  failure_reason?: string | null;
  error_message?: string | null;
}

export interface UpsertSwapStepRequest {
  execution_id: string;
  step_key: string;
  step_order: number;
  attempt: number;
  status: SwapStepStatus;
  tx_hash?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface SwapStepResponse {
  id: string;
  execution_id: string;
  step_key: string;
  step_order: number;
  attempt: number;
  status: SwapStepStatus;
  tx_hash: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

// ─── Activity ────────────────────────────────────────────────────────────────

export type ActivitySource = "transaction" | "ward_request";
export type ActivityStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "rejected"
  | "gas_error"
  | "expired";

export interface ActivityRecordResponse {
  id: string;
  source: ActivitySource;
  wallet_address: string;
  tx_hash: string;
  type: string;
  token: string;
  amount: string | null;
  amount_unit: AmountUnit | null;
  recipient: string | null;
  recipient_name: string | null;
  note: string | null;
  status: ActivityStatus;
  status_detail?: string;
  error_message: string | null;
  account_type: AccountType;
  ward_address: string | null;
  fee: string | null;
  network: string;
  platform: string | null;
  created_at: string;
  responded_at?: string | null;
  swap?: {
    execution_id?: string;
    provider: string;
    sell_token: string;
    buy_token: string;
    sell_amount_wei: string;
    estimated_buy_amount_wei: string;
    min_buy_amount_wei: string;
    buy_actual_amount_wei: string | null;
    tx_hashes: string[] | null;
    primary_tx_hash: string | null;
    status?: string;
    failure_step_key?: string | null;
    failure_reason?: string | null;
    steps?: Array<{
      step_key: string;
      step_order: number;
      status: string;
      tx_hash?: string | null;
      message?: string | null;
      started_at?: string | null;
      finished_at?: string | null;
    }>;
  } | null;
}

export interface ActivityListResponse {
  records: ActivityRecordResponse[];
  total: number;
  has_more: boolean;
}

// ─── Push Notifications ──────────────────────────────────────────────────────

export type PushPlatform = "ios" | "android" | "web" | "extension";

export interface PushRegisterRequest {
  platform: PushPlatform;
  device_id: string;
  token?: string | null;
  endpoint?: string | null;
  p256dh?: string | null;
  auth?: string | null;
}

// ─── Compliance ──────────────────────────────────────────────────────────────

export type ViewingGrantStatus = "active" | "revoked" | "expired";

export interface CreateViewingGrantRequest {
  viewer_address: string;
  encrypted_viewing_key: string;
  scope: string;
  expires_at?: string | null;
}

export interface ViewingGrantResponse {
  id: string;
  owner_address: string;
  viewer_address: string;
  encrypted_viewing_key: string;
  scope: string;
  expires_at: string | null;
  status: ViewingGrantStatus;
  created_at: string;
  revoked_at: string | null;
  revocation_reason: string | null;
}

export interface CreateInnocenceProofRequest {
  proof_hash: string;
  circuit_version: string;
  nullifier_hash?: string | null;
  note?: string | null;
}

export interface InnocenceProofResponse {
  id: string;
  owner_address: string;
  proof_hash: string;
  circuit_version: string;
  nullifier_hash: string | null;
  note: string | null;
  created_at: string;
}

// ─── Generic API ─────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
  details?: string;
}

export interface ApiSuccess<T = void> {
  data: T;
}

/** Pagination params accepted by list endpoints */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}
