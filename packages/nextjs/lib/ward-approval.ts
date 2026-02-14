/**
 * Ward approval pipeline for Cloak web app.
 *
 * Thin wrapper around the SDK ward module.
 * Constructs a SupabaseLite from localStorage config and delegates to SDK.
 */

import { RpcProvider } from "starknet";
import {
  DEFAULT_RPC,
  SupabaseLite,
  checkIfWardAccount as sdkCheckIfWardAccount,
  fetchWardApprovalNeeds,
  requestWardApproval as sdkRequestWardApproval,
  normalizeAddress,
} from "@cloak-wallet/sdk";
import type {
  WardApprovalNeeds,
  WardApprovalParams,
  WardApprovalResult,
} from "@cloak-wallet/sdk";
import { getSupabaseConfig } from "~~/lib/two-factor";

export type { WardApprovalNeeds, WardApprovalParams, WardApprovalResult };
export { normalizeAddress };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClient(): SupabaseLite {
  const { url, key } = getSupabaseConfig();
  return new SupabaseLite(url, key);
}

function getProvider(): RpcProvider {
  return new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
}

// ─── Ward checks ─────────────────────────────────────────────────────────────

export async function checkWardApprovalNeeds(
  wardAddress: string,
): Promise<WardApprovalNeeds | null> {
  const provider = getProvider();
  return fetchWardApprovalNeeds(provider, wardAddress);
}

// ─── Ward approval request + poll ─────────────────────────────────────────────

export interface RequestWardApprovalParams extends WardApprovalParams {
  onStatusChange?: (status: string) => void;
  signal?: AbortSignal;
}

export async function requestWardApproval(
  params: RequestWardApprovalParams,
): Promise<WardApprovalResult> {
  const client = getClient();
  return sdkRequestWardApproval(
    client,
    params,
    params.onStatusChange,
    params.signal,
  );
}
