/**
 * Two-Factor Authentication support for Cloak web app.
 *
 * Uses the SDK's CloakApiClient to coordinate 2FA approval requests
 * between the web app and the mobile app.
 *
 * The web app CANNOT sign transactions (no private key access with external wallets).
 * Instead, it sends raw call data to the backend. The mobile app (which holds both keys)
 * handles all signing and submits the final transaction.
 */

import {
  normalizeAddress as sdkNormalizeAddress,
  request2FAApproval as sdkRequest2FAApproval,
  getProvider,
} from "@cloak-wallet/sdk";
import type { TwoFAApprovalResult } from "@cloak-wallet/sdk";
import { getClient } from "~~/lib/api-client";

// ---------------------------------------------------------------------------
// 2FA helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a hex address: lowercase, strip leading zeros after 0x prefix.
 * Re-exported from SDK for backward compatibility.
 */
export const normalizeAddress = sdkNormalizeAddress;

/**
 * Check whether 2FA is enabled for the given wallet address.
 */
export async function check2FAEnabled(walletAddress: string): Promise<boolean> {
  try {
    const client = getClient();
    const normalized = normalizeAddress(walletAddress);
    const result = await client.getTwoFactorStatus(normalized);
    return result.enabled;
  } catch (err) {
    console.warn("[2FA] Failed to check 2FA status:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Approval request types
// ---------------------------------------------------------------------------

export interface ApprovalRequestParams {
  walletAddress: string;
  action: string;
  token: string;
  amount?: string;
  recipient?: string;
  callsJson: string;
  sig1Json: string;
  nonce: string;
  resourceBoundsJson: string;
  txHash: string;
  onStatusChange?: (status: string) => void;
  signal?: AbortSignal;
}

export interface ApprovalResult {
  approved: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Fetch the on-chain nonce for a wallet address.
 * Falls back to "auto" if the RPC call fails.
 */
export async function fetchWalletNonce(walletAddress: string): Promise<string> {
  try {
    const provider = getProvider();
    const nonce = await provider.getNonceForAddress(normalizeAddress(walletAddress));
    return nonce.toString();
  } catch {
    console.warn("[2FA] Failed to fetch nonce");
    return "auto";
  }
}

/**
 * Create an approval request and poll until the mobile app
 * approves or rejects it (or until timeout / cancellation).
 *
 * Wraps the SDK's request2FAApproval with the local ApprovalRequestParams interface.
 */
export async function request2FAApproval(
  params: ApprovalRequestParams,
): Promise<ApprovalResult> {
  const client = getClient();
  return sdkRequest2FAApproval(
    client,
    {
      walletAddress: params.walletAddress,
      action: params.action,
      token: params.token,
      amount: params.amount || null,
      recipient: params.recipient || null,
      callsJson: params.callsJson,
      sig1Json: params.sig1Json,
      nonce: params.nonce,
      resourceBoundsJson: params.resourceBoundsJson,
      txHash: params.txHash,
    },
    params.onStatusChange,
    params.signal,
  );
}
