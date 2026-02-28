/**
 * Spend Authorization Module
 *
 * Validates and consumes spend authorizations against delegation policies.
 * Each authorization is a one-time token tied to a specific delegation,
 * run, and action.
 *
 * When ERC8004_DELEGATION_MANAGER_ADDRESS is configured and non-zero,
 * consume calls CloakDelegation.consume_and_transfer on-chain to move
 * real tokens from the user's wallet to the recipient (typically the
 * agent signer that executes the on-chain operation).
 * Otherwise, falls back to the off-chain accounting-only path.
 */

import type {
  SpendAuthorization,
  SpendAuthorizationEvidence,
} from "@cloak-wallet/sdk";
import { num } from "starknet";
import {
  getDelegationRecord,
  validateDelegationForRunRecord,
  consumeDelegationRecord,
} from "./delegation-repo";
import { buildSignerAccount } from "./signer-utils";

// ─── Track consumed nonces for replay protection ─────────────────────────────

const consumedNonces = new Set<string>();

function nonceKey(auth: SpendAuthorization): string {
  return `${auth.delegation_id}:${auth.nonce}`;
}

// ─── On-chain detection ──────────────────────────────────────────────────────

function getDelegationManagerAddress(): string | null {
  const addr = process.env.ERC8004_DELEGATION_MANAGER_ADDRESS;
  if (!addr || addr === "0x0" || addr.trim() === "") return null;
  return addr;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface SpendAuthValidationResult {
  valid: boolean;
  reason?: string;
}

export async function validateSpendAuthorization(
  auth: SpendAuthorization,
): Promise<SpendAuthValidationResult> {
  if (!auth.delegation_id || !auth.run_id || !auth.agent_id) {
    return { valid: false, reason: "missing_required_fields" };
  }

  if (!auth.amount || BigInt(auth.amount) <= 0n) {
    return { valid: false, reason: "invalid_amount" };
  }

  const now = new Date();
  if (auth.expires_at && now >= new Date(auth.expires_at)) {
    return { valid: false, reason: "spend_auth_expired" };
  }

  if (consumedNonces.has(nonceKey(auth))) {
    return { valid: false, reason: "nonce_replay" };
  }

  const delegation = await getDelegationRecord(auth.delegation_id);
  if (!delegation) {
    return { valid: false, reason: "delegation_not_found" };
  }

  if (delegation.agent_id !== auth.agent_id) {
    return { valid: false, reason: "agent_id_mismatch" };
  }

  return validateDelegationForRunRecord(
    auth.delegation_id,
    auth.action,
    auth.amount,
    auth.token,
  );
}

// ─── Consume ─────────────────────────────────────────────────────────────────

export async function consumeSpendAuthorization(
  auth: SpendAuthorization,
  recipient?: string,
): Promise<SpendAuthorizationEvidence> {
  const validation = await validateSpendAuthorization(auth);
  if (!validation.valid) {
    throw new Error(
      `Spend authorization rejected: ${validation.reason}`,
    );
  }

  const delegationManagerAddr = getDelegationManagerAddress();

  // On-chain path: call consume_and_transfer to move real tokens to recipient
  if (delegationManagerAddr && recipient) {
    return consumeOnChain(auth, delegationManagerAddr, recipient);
  }

  // Off-chain path: accounting-only consume
  const consumeResult = await consumeDelegationRecord(auth.delegation_id, auth.amount);
  if (!consumeResult.ok) {
    throw new Error(
      `Delegation consume failed: ${consumeResult.error}`,
    );
  }

  consumedNonces.add(nonceKey(auth));

  return buildSpendAuthorizationEvidence(
    auth.delegation_id,
    auth.amount,
  );
}

// ─── On-chain consume ────────────────────────────────────────────────────────

async function consumeOnChain(
  auth: SpendAuthorization,
  delegationManagerAddr: string,
  recipient: string,
): Promise<SpendAuthorizationEvidence> {
  // Also update off-chain ledger for consistency
  const consumeResult = await consumeDelegationRecord(auth.delegation_id, auth.amount);
  if (!consumeResult.ok) {
    throw new Error(
      `Delegation consume failed: ${consumeResult.error}`,
    );
  }

  consumedNonces.add(nonceKey(auth));

  // Build the consume_and_transfer call — all 3 args are felt252.
  // Every value MUST be hex-normalized to avoid starknet.js calldata
  // serialization mismatches ("Input too long for arguments").
  const amountBig = BigInt(auth.amount);
  const rawDelegationId = auth.onchain_delegation_id ?? auth.delegation_id;
  const delegationIdHex = num.toHex(BigInt(rawDelegationId));
  const recipientHex = num.toHex(BigInt(recipient));

  const { account, provider } = await buildSignerAccount();

  // CRITICAL: tip must be 0n when signer may use DualKeySigner (2FA).
  // starknet.js v8 auto-estimates tip, causing hash mismatch with pre-computed sigs.
  const execution = await account.execute(
    [
      {
        contractAddress: delegationManagerAddr,
        entrypoint: "consume_and_transfer",
        calldata: [
          delegationIdHex,
          num.toHex(amountBig),
          recipientHex,
        ],
      },
    ],
    { tip: 0n },
  );

  const txHash =
    typeof execution === "string"
      ? execution
      : execution.transaction_hash || (execution as Record<string, string>).transactionHash;

  if (!txHash) {
    throw new Error("consume_and_transfer did not return a transaction hash");
  }

  // Wait for confirmation and check for reverts
  const receipt = await provider.waitForTransaction(txHash);
  if (
    receipt &&
    typeof receipt === "object" &&
    "execution_status" in receipt &&
    (receipt as unknown as Record<string, string>).execution_status === "REVERTED"
  ) {
    throw new Error(
      `consume_and_transfer reverted on-chain: ${txHash}`,
    );
  }

  const delegation = await getDelegationRecord(auth.delegation_id);

  return {
    delegation_id: auth.delegation_id,
    authorized_amount: auth.amount,
    consumed_amount: delegation?.consumed_amount ?? auth.amount,
    remaining_allowance_snapshot: delegation?.remaining_allowance ?? "0",
    delegation_consume_tx_hash: txHash,
    escrow_transfer_tx_hash: txHash,
  };
}

// ─── Evidence builder ────────────────────────────────────────────────────────

export async function buildSpendAuthorizationEvidence(
  delegationId: string,
  amount: string,
): Promise<SpendAuthorizationEvidence> {
  const delegation = await getDelegationRecord(delegationId);
  if (!delegation) {
    throw new Error(`Delegation ${delegationId} not found`);
  }

  return {
    delegation_id: delegationId,
    authorized_amount: amount,
    consumed_amount: delegation.consumed_amount,
    remaining_allowance_snapshot: delegation.remaining_allowance,
    delegation_consume_tx_hash: null,
    escrow_transfer_tx_hash: null,
  };
}

// ─── Test helpers ────────────────────────────────────────────────────────────

export function clearSpendAuthorizationState(): void {
  consumedNonces.clear();
}
