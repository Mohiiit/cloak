/**
 * Zod validation schemas for all API endpoints.
 *
 * Each schema mirrors the corresponding TypeScript interface from
 * @cloak-wallet/sdk/types/api but enforces runtime validation.
 */

import { z } from "zod";
import { badRequest } from "./errors";

// ─── Shared Primitives ──────────────────────────────────────────────────────

/** Hex string starting with 0x (any length). */
const hexString = z.string().regex(/^0x[0-9a-fA-F]+$/, "Must be a hex string starting with 0x");

/** Non-empty string. */
const nonEmpty = z.string().min(1, "Must not be empty");

/** ISO 8601 datetime string. */
const isoDatetime = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
  "Must be an ISO 8601 datetime",
);

// ─── Enums ──────────────────────────────────────────────────────────────────

const ApprovalStatusEnum = z.enum([
  "pending",
  "approved",
  "rejected",
  "failed",
  "expired",
]);

const WardStatusEnum = z.enum(["active", "frozen", "removed"]);

const WardApprovalStatusEnum = z.enum([
  "pending_ward_sig",
  "pending_guardian",
  "approved",
  "rejected",
  "failed",
  "gas_error",
  "expired",
]);

const TransactionStatusEnum = z.enum(["pending", "confirmed", "failed"]);

const AccountTypeEnum = z.enum(["normal", "ward", "guardian"]);

const AmountUnitEnum = z.enum(["tongo_units", "erc20_wei", "erc20_display"]);

const SwapExecutionStatusEnum = z.enum([
  "pending",
  "running",
  "confirmed",
  "failed",
]);

const SwapStepStatusEnum = z.enum([
  "pending",
  "running",
  "success",
  "failed",
  "skipped",
]);

const PushPlatformEnum = z.enum(["ios", "android", "web", "extension"]);

const X402VersionEnum = z.literal("1");
const X402SchemeEnum = z.literal("cloak-shielded-x402");
const AgentTypeEnum = z.enum([
  "staking_steward",
  "treasury_dispatcher",
  "swap_runner",
]);
const AgentPricingModeEnum = z.enum([
  "per_run",
  "subscription",
  "success_fee",
]);
const AgentProfileStatusEnum = z.enum(["active", "paused", "retired"]);
const AgentHireStatusEnum = z.enum(["active", "paused", "revoked"]);

// ─── Auth ───────────────────────────────────────────────────────────────────

export const AuthRegisterSchema = z.object({
  wallet_address: hexString,
  public_key: hexString,
});

// ─── Two-Factor ─────────────────────────────────────────────────────────────

export const TwoFactorEnableSchema = z.object({
  wallet_address: hexString,
  secondary_public_key: hexString,
});

// ─── Approval Requests (2FA) ────────────────────────────────────────────────

export const CreateApprovalSchema = z.object({
  wallet_address: hexString,
  action: nonEmpty,
  token: nonEmpty,
  amount: z.string().nullable(),
  recipient: z.string().nullable(),
  calls_json: nonEmpty,
  sig1_json: nonEmpty,
  nonce: nonEmpty,
  resource_bounds_json: nonEmpty,
  tx_hash: hexString,
});

export const UpdateApprovalSchema = z.object({
  status: ApprovalStatusEnum,
  final_tx_hash: hexString.nullable().optional(),
  error_message: z.string().nullable().optional(),
});

// ─── Ward Configs ───────────────────────────────────────────────────────────

export const CreateWardConfigSchema = z.object({
  ward_address: hexString,
  guardian_address: hexString,
  ward_public_key: hexString,
  guardian_public_key: hexString,
  spending_limit_per_tx: z.string().nullable().optional(),
  max_per_tx: z.string().nullable().optional(),
  pseudo_name: z.string().nullable().optional(),
});

export const UpdateWardConfigSchema = z.object({
  status: WardStatusEnum.optional(),
  spending_limit_per_tx: z.string().nullable().optional(),
  require_guardian_for_all: z.boolean().optional(),
});

// ─── Ward Approval Requests ─────────────────────────────────────────────────

export const CreateWardApprovalSchema = z.object({
  ward_address: hexString,
  guardian_address: hexString,
  action: nonEmpty,
  token: nonEmpty,
  amount: z.string().nullable(),
  amount_unit: AmountUnitEnum.nullable().optional(),
  recipient: z.string().nullable(),
  calls_json: nonEmpty,
  nonce: nonEmpty,
  resource_bounds_json: nonEmpty,
  tx_hash: hexString,
  ward_sig_json: nonEmpty,
  needs_ward_2fa: z.boolean(),
  needs_guardian: z.boolean(),
  needs_guardian_2fa: z.boolean(),
  initial_status: z.enum(["pending_ward_sig", "pending_guardian"]).optional(),
});

export const UpdateWardApprovalSchema = z.object({
  status: WardApprovalStatusEnum,
  nonce: z.string().nullable().optional(),
  resource_bounds_json: z.string().nullable().optional(),
  tx_hash: hexString.nullable().optional(),
  ward_sig_json: z.string().nullable().optional(),
  ward_2fa_sig_json: z.string().nullable().optional(),
  guardian_sig_json: z.string().nullable().optional(),
  guardian_2fa_sig_json: z.string().nullable().optional(),
  final_tx_hash: hexString.nullable().optional(),
  error_message: z.string().nullable().optional(),
});

// ─── Transactions ───────────────────────────────────────────────────────────

export const SaveTransactionSchema = z.object({
  wallet_address: hexString,
  tx_hash: hexString,
  type: nonEmpty,
  token: nonEmpty,
  amount: z.string().nullable().optional(),
  amount_unit: AmountUnitEnum.nullable().optional(),
  recipient: z.string().nullable().optional(),
  recipient_name: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  status: TransactionStatusEnum,
  error_message: z.string().nullable().optional(),
  account_type: AccountTypeEnum,
  ward_address: hexString.nullable().optional(),
  fee: z.string().nullable().optional(),
  network: nonEmpty,
  platform: z.string().nullable().optional(),
});

export const UpdateTransactionSchema = z.object({
  status: TransactionStatusEnum,
  error_message: z.string().nullable().optional(),
  fee: z.string().nullable().optional(),
});

// ─── Swaps ──────────────────────────────────────────────────────────────────

export const SaveSwapSchema = z.object({
  execution_id: nonEmpty,
  wallet_address: hexString,
  ward_address: hexString.nullable().optional(),
  tx_hash: hexString.nullable().optional(),
  primary_tx_hash: hexString.nullable().optional(),
  tx_hashes: z.array(z.string()).nullable().optional(),
  provider: nonEmpty,
  sell_token: nonEmpty,
  buy_token: nonEmpty,
  sell_amount_wei: nonEmpty,
  estimated_buy_amount_wei: nonEmpty,
  min_buy_amount_wei: nonEmpty,
  buy_actual_amount_wei: z.string().nullable().optional(),
  failure_step_key: z.string().nullable().optional(),
  failure_reason: z.string().nullable().optional(),
  route_meta: z.record(z.string(), z.unknown()).nullable().optional(),
  status: SwapExecutionStatusEnum,
  error_message: z.string().nullable().optional(),
});

export const UpdateSwapSchema = z.object({
  status: SwapExecutionStatusEnum.optional(),
  tx_hash: hexString.nullable().optional(),
  primary_tx_hash: hexString.nullable().optional(),
  tx_hashes: z.array(z.string()).nullable().optional(),
  buy_actual_amount_wei: z.string().nullable().optional(),
  failure_step_key: z.string().nullable().optional(),
  failure_reason: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
});

export const UpsertSwapStepSchema = z.object({
  execution_id: nonEmpty,
  step_key: nonEmpty,
  step_order: z.number().int().nonnegative(),
  attempt: z.number().int().nonnegative(),
  status: SwapStepStatusEnum,
  tx_hash: hexString.nullable().optional(),
  message: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  started_at: isoDatetime.nullable().optional(),
  finished_at: isoDatetime.nullable().optional(),
});

// ─── Push Notifications ─────────────────────────────────────────────────────

export const PushRegisterSchema = z.object({
  platform: PushPlatformEnum,
  device_id: nonEmpty,
  token: z.string().nullable().optional(),
  endpoint: z.string().url("Must be a valid URL").nullable().optional(),
  p256dh: z.string().nullable().optional(),
  auth: z.string().nullable().optional(),
});

// ─── Compliance ─────────────────────────────────────────────────────────────

export const CreateViewingGrantSchema = z.object({
  viewer_address: hexString,
  encrypted_viewing_key: nonEmpty,
  scope: nonEmpty,
  expires_at: isoDatetime.nullable().optional(),
});

export const CreateInnocenceProofSchema = z.object({
  proof_hash: nonEmpty,
  circuit_version: nonEmpty,
  nullifier_hash: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

// ─── x402 Payments ───────────────────────────────────────────────────────────

export const X402ChallengeSchema = z.object({
  version: X402VersionEnum,
  scheme: X402SchemeEnum,
  challengeId: nonEmpty,
  network: nonEmpty,
  token: nonEmpty,
  minAmount: nonEmpty,
  recipient: hexString,
  contextHash: z.string().min(16),
  expiresAt: isoDatetime,
  facilitator: z.string().url("Must be a valid URL"),
  signature: z.string().optional(),
});

export const X402PaymentPayloadSchema = z.object({
  version: X402VersionEnum,
  scheme: X402SchemeEnum,
  challengeId: nonEmpty,
  tongoAddress: nonEmpty,
  token: nonEmpty,
  amount: nonEmpty,
  proof: nonEmpty,
  replayKey: nonEmpty,
  contextHash: z.string().min(16),
  expiresAt: isoDatetime,
  nonce: nonEmpty,
  createdAt: isoDatetime,
});

export const X402VerifyRequestSchema = z.object({
  challenge: X402ChallengeSchema,
  payment: X402PaymentPayloadSchema,
});

export const X402SettleRequestSchema = X402VerifyRequestSchema;

// ─── Marketplace Agent Registry (ERC-8004 profile layer) ───────────────────

export const AgentEndpointProofSchema = z.object({
  endpoint: z.string().url("Must be a valid URL"),
  nonce: nonEmpty,
  digest: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "Digest must be a 64-char hex string"),
});

export const RegisterAgentSchema = z.object({
  agent_id: nonEmpty,
  name: nonEmpty,
  description: nonEmpty,
  image_url: z.string().url("Must be a valid URL").nullable().optional(),
  agent_type: AgentTypeEnum,
  capabilities: z.array(nonEmpty).min(1),
  endpoints: z.array(z.string().url("Must be a valid URL")).min(1),
  endpoint_proofs: z.array(AgentEndpointProofSchema).optional(),
  pricing: z.object({
    mode: AgentPricingModeEnum,
    amount: nonEmpty,
    token: nonEmpty,
    cadence: z.string().optional(),
  }),
  metadata_uri: z.string().url("Must be a valid URL").nullable().optional(),
  operator_wallet: hexString,
  service_wallet: hexString,
  trust_score: z.number().min(0).max(100).optional(),
  verified: z.boolean().optional(),
  status: AgentProfileStatusEnum.optional(),
});

export const DiscoverAgentsQuerySchema = z.object({
  capability: z.string().optional(),
  agent_type: AgentTypeEnum.optional(),
  verified_only: z
    .union([
      z.boolean(),
      z.string().transform((value) => value === "true"),
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const CreateAgentHireSchema = z.object({
  agent_id: nonEmpty,
  operator_wallet: hexString,
  policy_snapshot: z.record(z.string(), z.unknown()),
  billing_mode: AgentPricingModeEnum,
});

export const UpdateAgentHireSchema = z.object({
  status: AgentHireStatusEnum,
});

// ─── Validation Helper ──────────────────────────────────────────────────────

/**
 * Validate data against a Zod schema.
 * Returns the parsed (and potentially transformed) data on success.
 * Throws a NextResponse (via badRequest) on validation failure — callers
 * should catch this in the route handler and return it directly.
 */
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues;
    const message = issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      })
      .join("; ");
    throw new ValidationError(message);
  }
  return result.data;
}

/**
 * Validation error class.
 * Route handlers should catch this and return badRequest(err.message).
 */
export class ValidationError extends Error {
  readonly response: ReturnType<typeof badRequest>;

  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
    this.response = badRequest(message, "VALIDATION_ERROR");
  }
}
