// ─── 2FA approval system via API client + on-chain ─────────────────────

import { getApiClient, resetApiClient } from "./api-config";
import {
  request2FAApproval as sdkRequest2FAApproval,
  normalizeAddress,
  getProvider,
} from "@cloak-wallet/sdk";
import type {
  TwoFAApprovalParams as SdkParams,
  TwoFAApprovalResult,
} from "@cloak-wallet/sdk";

export { normalizeAddress };
export type { TwoFAApprovalResult };

// ─── Check if a wallet has 2FA enabled (on-chain first, API fallback) ──

export async function check2FAEnabled(walletAddress: string): Promise<boolean> {
  // Try on-chain check first (CloakAccount contract)
  const onChain = await check2FAEnabledOnChain(walletAddress);
  if (onChain) return true;

  // Fallback to API check (for OZ accounts or if on-chain check fails)
  try {
    const client = await getApiClient();
    const result = await client.getTwoFactorStatus(walletAddress);
    return result.enabled;
  } catch (err) {
    console.warn("[2FA] Failed to check 2FA status:", err);
    return false;
  }
}

/**
 * Check if 2FA is enabled on-chain by reading the CloakAccount contract.
 * Returns false if the account is not a CloakAccount or if the call fails.
 */
export async function check2FAEnabledOnChain(walletAddress: string): Promise<boolean> {
  try {
    const provider = getProvider();
    const result = await provider.callContract({
      contractAddress: walletAddress,
      entrypoint: "is_2fa_enabled",
      calldata: [],
    });
    return result[0] !== "0x0" && result[0] !== "0";
  } catch {
    // Not a CloakAccount or not deployed — 2FA not enabled on-chain
    return false;
  }
}

// ─── Request 2FA approval from mobile device ────────────────────────

export interface TwoFAApprovalParams {
  walletAddress: string;
  action: string;
  token: string;
  amount: string | null;
  recipient: string | null;
  callsJson: string;
  sig1Json: string;
  nonce: string;
  resourceBoundsJson: string;
  txHash: string;
  onStatusChange?: (status: string) => void;
  signal?: AbortSignal;
}

export async function request2FAApproval(
  params: TwoFAApprovalParams,
): Promise<TwoFAApprovalResult> {
  const sdkParams = {
    walletAddress: params.walletAddress,
    action: params.action,
    token: params.token,
    amount: params.amount,
    recipient: params.recipient,
    callsJson: params.callsJson,
    sig1Json: params.sig1Json,
    nonce: params.nonce,
    resourceBoundsJson: params.resourceBoundsJson,
    txHash: params.txHash,
  };

  const client = await getApiClient();
  const result = await sdkRequest2FAApproval(
    client,
    sdkParams,
    params.onStatusChange,
    params.signal,
  );

  // SDK catches 401 internally and returns { approved: false, error: "...Invalid API key..." }
  // Detect this, reset the stale key, and retry once with a fresh client.
  if (
    !result.approved &&
    result.error &&
    (result.error.includes("Invalid API key") || result.error.includes("401"))
  ) {
    resetApiClient();
    const freshClient = await getApiClient();
    return sdkRequest2FAApproval(
      freshClient,
      sdkParams,
      params.onStatusChange,
      params.signal,
    );
  }

  return result;
}
