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

export interface WardApprovalStatusSnapshot {
  id: string;
  status: WardApprovalStatus;
  tx_hash: string | null;
  final_tx_hash: string | null;
  error_message: string | null;
  created_at: string;
  responded_at: string | null;
  updated_at?: string | null;
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

export interface PendingWardApprovalsQuery {
  ward?: string;
  guardian?: string;
  status?: WardApprovalStatus | WardApprovalStatus[];
  limit?: number;
  offset?: number;
  include_all?: boolean;
  updated_after?: string;
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

export type SwapExecutionStatus =
  | "pending"
  | "running"
  | "confirmed"
  | "failed";
export type SwapStepStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";

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

export type ActivitySource = "transaction" | "ward_request" | "agent_run";
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
  agent_run?: {
    run_id: string;
    agent_id: string;
    action: string;
    billable: boolean;
    payment_ref: string | null;
    settlement_tx_hash: string | null;
    execution_tx_hashes: string[] | null;
  } | null;
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

// ─── x402 Marketplace Payments ───────────────────────────────────────────────

export type X402Version = "1";
export type X402Scheme = "cloak-shielded-x402";
export type X402PaymentStatus =
  | "accepted"
  | "rejected"
  | "settled"
  | "pending"
  | "failed";

export type X402ErrorCode =
  | "INVALID_PAYLOAD"
  | "INVALID_TONGO_PROOF"
  | "TONGO_UNCONFIRMED"
  | "TONGO_CONTEXT_MISMATCH"
  | "EXPIRED_PAYMENT"
  | "REPLAY_DETECTED"
  | "CONTEXT_MISMATCH"
  | "POLICY_DENIED"
  | "RPC_FAILURE"
  | "SETTLEMENT_FAILED"
  | "TIMEOUT";

export type X402TongoProofType = "tongo_attestation_v1";
export type X402TongoProofOperation =
  | "fund"
  | "transfer"
  | "withdraw"
  | "ragequit"
  | "rollover"
  | "audit";

export interface X402TongoProofBundle {
  operation: X402TongoProofOperation;
  inputs: unknown;
  proof: unknown;
}

export interface X402TongoProofEnvelope {
  envelopeVersion: "1";
  proofType: X402TongoProofType;
  intentHash: string;
  settlementTxHash?: string;
  attestor?: string;
  issuedAt?: string;
  signature?: string;
  tongoProof?: X402TongoProofBundle;
  metadata?: Record<string, unknown>;
}

export interface X402ChallengeResponse {
  version: X402Version;
  scheme: X402Scheme;
  challengeId: string;
  network: string;
  token: string;
  minAmount: string;
  recipient: string;
  /** Base58 Tongo address for shielded transfer payments (if available). */
  tongoRecipient?: string;
  contextHash: string;
  expiresAt: string;
  facilitator: string;
  signature?: string;
}

export interface X402PaymentPayloadRequest {
  version: X402Version;
  scheme: X402Scheme;
  challengeId: string;
  tongoAddress: string;
  token: string;
  amount: string;
  proof: string;
  replayKey: string;
  contextHash: string;
  expiresAt: string;
  nonce: string;
  createdAt: string;
}

export interface X402VerifyRequest {
  challenge: X402ChallengeResponse;
  payment: X402PaymentPayloadRequest;
}

export interface X402VerifyResponse {
  status: "accepted" | "rejected";
  reasonCode?: X402ErrorCode;
  retryable: boolean;
  paymentRef: string;
}

export interface X402SettleRequest {
  challenge: X402ChallengeResponse;
  payment: X402PaymentPayloadRequest;
}

export interface X402SettleResponse {
  status: "settled" | "pending" | "rejected" | "failed";
  txHash?: string;
  paymentRef: string;
  reasonCode?: X402ErrorCode;
}

// ─── Marketplace: Agents / Hires / Runs ─────────────────────────────────────

export type AgentRunStatus =
  | "queued"
  | "blocked_policy"
  | "pending_payment"
  | "running"
  | "completed"
  | "failed";

export type AgentHireStatus = "active" | "paused" | "revoked";

export type AgentType =
  | "staking_steward"
  | "treasury_dispatcher"
  | "swap_runner";
export type AgentPricingMode = "per_run" | "subscription" | "success_fee";
export type AgentProfileStatus = "active" | "paused" | "retired";
export type AgentOnchainStatus =
  | "skipped"
  | "verified"
  | "mismatch"
  | "unknown";
export type AgentOnchainWriteStatus =
  | "skipped"
  | "pending"
  | "confirmed"
  | "failed";

export interface AgentEndpointOwnershipProof {
  endpoint: string;
  nonce: string;
  digest: string;
}

export interface AgentTrustSummary {
  owner_match: boolean;
  reputation_score: number;
  validation_score: number;
  freshness_seconds: number;
}

export interface AgentOnchainWriteRequest {
  entrypoint?: string;
  calldata?: string[];
  wait_for_confirmation?: boolean;
  timeout_ms?: number;
}

export interface RegisterAgentRequest {
  agent_id: string;
  name: string;
  description: string;
  image_url?: string | null;
  agent_type: AgentType;
  capabilities: string[];
  endpoints: string[];
  endpoint_proofs?: AgentEndpointOwnershipProof[];
  pricing: {
    mode: AgentPricingMode;
    amount: string;
    token: string;
    cadence?: string;
  };
  metadata_uri?: string | null;
  operator_wallet: string;
  service_wallet: string;
  trust_score?: number;
  verified?: boolean;
  status?: AgentProfileStatus;
  onchain_write?: AgentOnchainWriteRequest;
}

export interface AgentProfileResponse {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  image_url: string | null;
  agent_type: AgentType;
  capabilities: string[];
  endpoints: string[];
  pricing: Record<string, unknown>;
  metadata_uri: string | null;
  operator_wallet: string;
  service_wallet: string;
  trust_score: number;
  trust_summary?: AgentTrustSummary;
  verified: boolean;
  status?: AgentProfileStatus;
  registry_version?: string;
  onchain_status?: AgentOnchainStatus;
  onchain_owner?: string | null;
  onchain_reason?: string | null;
  onchain_checked_at?: string | null;
  onchain_write_status?: AgentOnchainWriteStatus;
  onchain_write_tx_hash?: string | null;
  onchain_write_reason?: string | null;
  onchain_write_checked_at?: string | null;
  last_indexed_at?: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface DiscoverAgentsQuery {
  capability?: string;
  agent_type?: AgentType;
  verified_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateAgentHireRequest {
  agent_id: string;
  operator_wallet: string;
  policy_snapshot: Record<string, unknown>;
  billing_mode: AgentPricingMode;
}

export interface AgentHireResponse {
  id: string;
  agent_id: string;
  operator_wallet: string;
  policy_snapshot: Record<string, unknown>;
  billing_mode: AgentPricingMode;
  status: AgentHireStatus;
  created_at: string;
  updated_at: string | null;
}

export interface CreateAgentRunRequest {
  hire_id: string;
  action: string;
  params: Record<string, unknown>;
  billable: boolean;
  spend_authorization?: SpendAuthorization;
}

export interface AgentRunResponse {
  id: string;
  hire_id: string;
  agent_id: string;
  hire_operator_wallet?: string | null;
  action: string;
  params: Record<string, unknown>;
  billable: boolean;
  status: AgentRunStatus;
  payment_ref: string | null;
  settlement_tx_hash: string | null;
  payment_evidence?: {
    scheme: X402Scheme | null;
    payment_ref: string | null;
    settlement_tx_hash: string | null;
    state?:
      | "required"
      | "pending_payment"
      | "settled"
      | "failed"
      | null;
  } | null;
  agent_trust_snapshot?: AgentTrustSummary | null;
  execution_tx_hashes: string[] | null;
  result: Record<string, unknown> | null;
  delegation_evidence?: SpendAuthorizationEvidence | null;
  created_at: string;
  updated_at: string | null;
}

// ─── Delegations ─────────────────────────────────────────────────────────────

export type DelegationStatus = "active" | "revoked" | "expired";

export interface CreateDelegationRequest {
  agent_id: string;
  agent_type: AgentType;
  allowed_actions: string[];
  token: string;
  max_per_run: string;
  total_allowance: string;
  daily_cap?: string;
  valid_from: string;
  valid_until: string;
  onchain_tx_hash?: string;
  onchain_delegation_id?: string;
  delegation_contract?: string;
}

export interface DelegationResponse {
  id: string;
  operator_wallet: string;
  agent_id: string;
  agent_type: AgentType;
  allowed_actions: string[];
  token: string;
  max_per_run: string;
  total_allowance: string;
  daily_cap: string | null;
  consumed_amount: string;
  remaining_allowance: string;
  nonce: number;
  valid_from: string;
  valid_until: string;
  status: DelegationStatus;
  onchain_tx_hash: string | null;
  onchain_delegation_id: string | null;
  escrow_tx_hash: string | null;
  delegation_contract: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface SpendAuthorization {
  delegation_id: string;
  onchain_delegation_id?: string;
  run_id: string;
  agent_id: string;
  action: string;
  amount: string;
  token: string;
  expires_at: string;
  nonce: string;
}

export interface SpendAuthorizationEvidence {
  delegation_id: string;
  authorized_amount: string;
  consumed_amount: string;
  remaining_allowance_snapshot: string;
  delegation_consume_tx_hash: string | null;
  escrow_transfer_tx_hash: string | null;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export type LeaderboardPeriod = "24h" | "7d" | "30d";

export interface LeaderboardEntry {
  agent_id: string;
  name: string;
  agent_type: AgentType;
  work_score: number;
  successful_runs: number;
  settled_runs: number;
  settled_volume: string;
  success_rate: number;
  avg_execution_latency_ms: number;
  trust_score: number;
  onchain_status: AgentOnchainStatus;
  updated_at: string;
}

export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  entries: LeaderboardEntry[];
  total: number;
  computed_at: string;
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
