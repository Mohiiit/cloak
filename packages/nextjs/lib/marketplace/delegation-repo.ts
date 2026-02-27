/**
 * Delegation Repository — Dual-layer persistence
 *
 * Follows the same pattern as agents-repo.ts:
 * - If Supabase env is configured, attempt Supabase first, fallback to in-memory.
 * - If no Supabase env, use in-memory delegation-registry.ts directly.
 */

import type {
  CreateDelegationRequest,
  DelegationResponse,
} from "@cloak-wallet/sdk";
import { getSupabase } from "~~/app/api/v1/_lib/supabase";
import {
  createDelegation,
  getDelegation,
  listDelegations,
  revokeDelegation,
  consumeDelegation,
  validateDelegationForRun,
} from "./delegation-registry";
import type { ConsumeResult, ValidationResult } from "./delegation-registry";
import { hasSupabaseEnv, nowIso, randomId } from "./repo-utils";

const TABLE = "marketplace_delegations";

// ─── Supabase row shape ──────────────────────────────────────────────────────

interface DelegationRow {
  id: string;
  operator_wallet: string;
  agent_id: string;
  agent_type: string;
  allowed_actions: unknown;
  token: string;
  max_per_run: string;
  total_allowance: string;
  daily_cap: string | null;
  consumed_amount: string;
  remaining_allowance: string;
  nonce: number;
  valid_from: string;
  valid_until: string;
  status: string;
  onchain_tx_hash: string | null;
  onchain_delegation_id: string | null;
  escrow_tx_hash: string | null;
  delegation_contract: string | null;
  created_at: string;
  revoked_at: string | null;
}

function fromRow(row: DelegationRow): DelegationResponse {
  return {
    id: row.id,
    operator_wallet: row.operator_wallet,
    agent_id: row.agent_id,
    agent_type: row.agent_type as DelegationResponse["agent_type"],
    allowed_actions: Array.isArray(row.allowed_actions)
      ? (row.allowed_actions as string[])
      : [],
    token: row.token,
    max_per_run: row.max_per_run,
    total_allowance: row.total_allowance,
    daily_cap: row.daily_cap,
    consumed_amount: row.consumed_amount,
    remaining_allowance: row.remaining_allowance,
    nonce: row.nonce,
    valid_from: row.valid_from,
    valid_until: row.valid_until,
    status: row.status as DelegationResponse["status"],
    onchain_tx_hash: row.onchain_tx_hash,
    onchain_delegation_id: row.onchain_delegation_id,
    escrow_tx_hash: row.escrow_tx_hash,
    delegation_contract: row.delegation_contract,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
  };
}

// ─── Repository functions ───────────────────────────────────────────────────

export async function createDelegationRecord(
  operatorWallet: string,
  input: CreateDelegationRequest,
): Promise<DelegationResponse> {
  if (!hasSupabaseEnv()) return createDelegation(operatorWallet, input);

  try {
    const sb = getSupabase();
    const id = randomId("dlg");
    const now = nowIso();
    const row: Record<string, unknown> = {
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
    const rows = await sb.insert<DelegationRow>(TABLE, row);
    return fromRow(rows[0] ?? (row as unknown as DelegationRow));
  } catch {
    return createDelegation(operatorWallet, input);
  }
}

export async function getDelegationRecord(
  id: string,
): Promise<DelegationResponse | undefined> {
  if (!hasSupabaseEnv()) return getDelegation(id) ?? undefined;

  try {
    const sb = getSupabase();
    const rows = await sb.select<DelegationRow>(
      TABLE,
      `id=eq.${encodeURIComponent(id)}`,
      { limit: 1 },
    );
    return rows[0] ? fromRow(rows[0]) : undefined;
  } catch {
    return getDelegation(id) ?? undefined;
  }
}

export async function listDelegationRecords(
  operatorWallet: string,
  agentId?: string,
): Promise<DelegationResponse[]> {
  if (!hasSupabaseEnv()) return listDelegations(operatorWallet, agentId);

  try {
    const sb = getSupabase();
    let filters = `operator_wallet=eq.${encodeURIComponent(operatorWallet)}`;
    if (agentId) {
      filters += `&agent_id=eq.${encodeURIComponent(agentId)}`;
    }
    const rows = await sb.select<DelegationRow>(TABLE, filters, {
      orderBy: "created_at.desc",
      limit: 1000,
    });
    return rows.map(fromRow);
  } catch {
    return listDelegations(operatorWallet, agentId);
  }
}

export async function revokeDelegationRecord(
  id: string,
  operatorWallet: string,
): Promise<DelegationResponse | null> {
  if (!hasSupabaseEnv()) return revokeDelegation(id, operatorWallet);

  try {
    const sb = getSupabase();
    // Verify ownership and not already revoked
    const existing = await sb.select<DelegationRow>(
      TABLE,
      `id=eq.${encodeURIComponent(id)}&operator_wallet=eq.${encodeURIComponent(operatorWallet)}`,
      { limit: 1 },
    );
    if (!existing[0]) return null;
    if (existing[0].status === "revoked") return fromRow(existing[0]);

    const rows = await sb.update<DelegationRow>(
      TABLE,
      `id=eq.${encodeURIComponent(id)}&operator_wallet=eq.${encodeURIComponent(operatorWallet)}`,
      { status: "revoked", revoked_at: nowIso() },
    );
    return rows[0] ? fromRow(rows[0]) : null;
  } catch {
    return revokeDelegation(id, operatorWallet);
  }
}

export async function consumeDelegationRecord(
  id: string,
  amount: string,
): Promise<ConsumeResult> {
  if (!hasSupabaseEnv()) return consumeDelegation(id, amount);

  try {
    const sb = getSupabase();
    const rows = await sb.select<DelegationRow>(
      TABLE,
      `id=eq.${encodeURIComponent(id)}`,
      { limit: 1 },
    );
    const d = rows[0];
    if (!d) return { ok: false, remaining: "0", error: "delegation_not_found" };

    // Build a DelegationResponse for validation logic
    const delegation = fromRow(d);
    const now = new Date();
    const isExpired = now >= new Date(delegation.valid_until);
    const isActive =
      delegation.status === "active" &&
      now >= new Date(delegation.valid_from) &&
      !isExpired;

    if (!isActive) {
      const rem = BigInt(delegation.total_allowance) - BigInt(delegation.consumed_amount);
      return {
        ok: false,
        remaining: rem.toString(),
        error:
          delegation.status === "revoked"
            ? "delegation_revoked"
            : isExpired
              ? "delegation_expired"
              : "delegation_not_active",
      };
    }

    const amountBig = BigInt(amount);
    if (amountBig > BigInt(delegation.max_per_run)) {
      const rem = BigInt(delegation.total_allowance) - BigInt(delegation.consumed_amount);
      return { ok: false, remaining: rem.toString(), error: "exceeds_max_per_run" };
    }

    const rem = BigInt(delegation.total_allowance) - BigInt(delegation.consumed_amount);
    if (amountBig > rem) {
      return { ok: false, remaining: rem.toString(), error: "insufficient_allowance" };
    }

    const newConsumed = BigInt(delegation.consumed_amount) + amountBig;
    const newRemaining = BigInt(delegation.total_allowance) - newConsumed;

    await sb.update<DelegationRow>(
      TABLE,
      `id=eq.${encodeURIComponent(id)}`,
      {
        consumed_amount: newConsumed.toString(),
        remaining_allowance: newRemaining.toString(),
        nonce: delegation.nonce + 1,
      },
    );

    return { ok: true, remaining: newRemaining.toString() };
  } catch {
    return consumeDelegation(id, amount);
  }
}

export async function validateDelegationForRunRecord(
  delegationId: string,
  action: string,
  amount: string,
  token: string,
): Promise<ValidationResult> {
  if (!hasSupabaseEnv()) return validateDelegationForRun(delegationId, action, amount, token);

  try {
    const sb = getSupabase();
    const rows = await sb.select<DelegationRow>(
      TABLE,
      `id=eq.${encodeURIComponent(delegationId)}`,
      { limit: 1 },
    );
    const d = rows[0];
    if (!d) return { valid: false, reason: "delegation_not_found" };

    const delegation = fromRow(d);
    const now = new Date();

    if (delegation.status !== "active") {
      return { valid: false, reason: `delegation_${delegation.status}` };
    }
    if (now < new Date(delegation.valid_from)) {
      return { valid: false, reason: "delegation_not_yet_active" };
    }
    if (now >= new Date(delegation.valid_until)) {
      return { valid: false, reason: "delegation_expired" };
    }
    if (!delegation.allowed_actions.includes(action)) {
      return { valid: false, reason: "action_not_allowed" };
    }
    if (delegation.token.toLowerCase() !== token.toLowerCase()) {
      return { valid: false, reason: "token_mismatch" };
    }

    const amountBig = BigInt(amount);
    if (amountBig > BigInt(delegation.max_per_run)) {
      return { valid: false, reason: "exceeds_max_per_run" };
    }
    const rem = BigInt(delegation.total_allowance) - BigInt(delegation.consumed_amount);
    if (amountBig > rem) {
      return { valid: false, reason: "insufficient_allowance" };
    }

    return { valid: true };
  } catch {
    return validateDelegationForRun(delegationId, action, amount, token);
  }
}
