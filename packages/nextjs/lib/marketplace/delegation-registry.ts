/**
 * ERC-8004 Delegation Registry
 *
 * In-memory delegation store with validation and consume logic.
 * Follows the dual-layer pattern (in-memory + Supabase fallback) used
 * by agents-store / agents-repo, but starts in-memory-only for MVP.
 */

import type {
  AgentType,
  CreateDelegationRequest,
  DelegationResponse,
  DelegationStatus,
} from "@cloak-wallet/sdk";
import { randomId, nowIso } from "./repo-utils";

// ─── In-memory store ─────────────────────────────────────────────────────────
// Use globalThis to survive Next.js dev-mode recompilations.
// When a route is lazily compiled, its module-level state resets — but
// globalThis persists across all routes in the same Node.js process.

const GLOBAL_KEY = "__cloak_delegation_registry__" as const;

function getStore(): Map<string, DelegationResponse> {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map<string, DelegationResponse>();
  }
  return g[GLOBAL_KEY] as Map<string, DelegationResponse>;
}

const delegations = getStore();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function remaining(d: DelegationResponse): bigint {
  return BigInt(d.total_allowance) - BigInt(d.consumed_amount);
}

function isExpired(d: DelegationResponse, now = new Date()): boolean {
  return now >= new Date(d.valid_until);
}

function isActive(d: DelegationResponse, now = new Date()): boolean {
  return (
    d.status === "active" &&
    now >= new Date(d.valid_from) &&
    !isExpired(d, now)
  );
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export function createDelegation(
  operatorWallet: string,
  input: CreateDelegationRequest,
): DelegationResponse {
  const id = randomId("dlg");
  const now = nowIso();
  const delegation: DelegationResponse = {
    id,
    operator_wallet: operatorWallet,
    agent_id: input.agent_id,
    agent_type: input.agent_type,
    allowed_actions: input.allowed_actions,
    token: input.token,
    max_per_run: input.max_per_run,
    total_allowance: input.total_allowance,
    daily_cap: input.daily_cap ?? null,
    consumed_amount: "0",
    remaining_allowance: input.total_allowance,
    nonce: 0,
    valid_from: input.valid_from,
    valid_until: input.valid_until,
    status: "active",
    onchain_tx_hash: input.onchain_tx_hash ?? null,
    onchain_delegation_id: input.onchain_delegation_id ?? null,
    escrow_tx_hash: input.onchain_tx_hash ?? null,
    delegation_contract: input.delegation_contract ?? null,
    created_at: now,
    revoked_at: null,
  };
  delegations.set(id, delegation);
  return delegation;
}

export function getDelegation(id: string): DelegationResponse | null {
  return delegations.get(id) ?? null;
}

export function listDelegations(
  operatorWallet: string,
  agentId?: string,
): DelegationResponse[] {
  return [...delegations.values()]
    .filter((d) => d.operator_wallet === operatorWallet)
    .filter((d) => !agentId || d.agent_id === agentId)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
}

export function revokeDelegation(
  id: string,
  operatorWallet: string,
): DelegationResponse | null {
  const d = delegations.get(id);
  if (!d || d.operator_wallet !== operatorWallet) return null;
  if (d.status === "revoked") return d;
  const revoked: DelegationResponse = {
    ...d,
    status: "revoked",
    revoked_at: nowIso(),
  };
  delegations.set(id, revoked);
  return revoked;
}

// ─── Consume ─────────────────────────────────────────────────────────────────

export interface ConsumeResult {
  ok: boolean;
  remaining: string;
  error?: string;
}

export function consumeDelegation(
  id: string,
  amount: string,
): ConsumeResult {
  const d = delegations.get(id);
  if (!d) return { ok: false, remaining: "0", error: "delegation_not_found" };

  const now = new Date();
  if (!isActive(d, now)) {
    return {
      ok: false,
      remaining: remaining(d).toString(),
      error: d.status === "revoked"
        ? "delegation_revoked"
        : isExpired(d, now)
          ? "delegation_expired"
          : "delegation_not_active",
    };
  }

  const amountBig = BigInt(amount);
  if (amountBig > BigInt(d.max_per_run)) {
    return {
      ok: false,
      remaining: remaining(d).toString(),
      error: "exceeds_max_per_run",
    };
  }

  const rem = remaining(d);
  if (amountBig > rem) {
    return {
      ok: false,
      remaining: rem.toString(),
      error: "insufficient_allowance",
    };
  }

  const newConsumed = BigInt(d.consumed_amount) + amountBig;
  const newRemaining = BigInt(d.total_allowance) - newConsumed;
  const updated: DelegationResponse = {
    ...d,
    consumed_amount: newConsumed.toString(),
    remaining_allowance: newRemaining.toString(),
    nonce: d.nonce + 1,
  };
  delegations.set(id, updated);
  return { ok: true, remaining: newRemaining.toString() };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateDelegationForRun(
  delegationId: string,
  action: string,
  amount: string,
  token: string,
): ValidationResult {
  const d = delegations.get(delegationId);
  if (!d) return { valid: false, reason: "delegation_not_found" };

  const now = new Date();
  if (d.status !== "active") {
    return { valid: false, reason: `delegation_${d.status}` };
  }
  if (now < new Date(d.valid_from)) {
    return { valid: false, reason: "delegation_not_yet_active" };
  }
  if (isExpired(d, now)) {
    return { valid: false, reason: "delegation_expired" };
  }
  if (!d.allowed_actions.includes(action)) {
    return { valid: false, reason: "action_not_allowed" };
  }
  if (d.token.toLowerCase() !== token.toLowerCase()) {
    return { valid: false, reason: "token_mismatch" };
  }

  const amountBig = BigInt(amount);
  if (amountBig > BigInt(d.max_per_run)) {
    return { valid: false, reason: "exceeds_max_per_run" };
  }
  if (amountBig > remaining(d)) {
    return { valid: false, reason: "insufficient_allowance" };
  }

  return { valid: true };
}

// ─── Test helpers ────────────────────────────────────────────────────────────

export function clearDelegations(): void {
  delegations.clear();
}
