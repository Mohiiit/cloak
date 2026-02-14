/**
 * Ward approval system for Cloak extension.
 *
 * Thin wrapper around the SDK ward module.
 * Constructs a SupabaseLite from chrome.storage config and delegates to SDK.
 */

import {
  SupabaseLite,
  checkIfWardAccount as sdkCheckIfWardAccount,
  fetchWardApprovalNeeds,
  requestWardApproval as sdkRequestWardApproval,
  getProvider,
} from "@cloak-wallet/sdk";
import type {
  WardApprovalNeeds,
  WardApprovalParams,
  WardApprovalResult,
} from "@cloak-wallet/sdk";
import { getSupabaseConfig } from "./supabase-config";

export type { WardApprovalNeeds, WardApprovalResult };

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getSdkClient(): Promise<SupabaseLite> {
  const { url, key } = await getSupabaseConfig();
  return new SupabaseLite(url, key);
}

// ─── Ward on-chain checks ─────────────────────────────────────────────────────

export async function checkIfWardAccount(address: string): Promise<boolean> {
  return sdkCheckIfWardAccount(getProvider(), address);
}

export async function getWardApprovalNeeds(
  wardAddress: string,
): Promise<WardApprovalNeeds | null> {
  return fetchWardApprovalNeeds(getProvider(), wardAddress);
}

// ─── Ward approval request + poll ─────────────────────────────────────────────

export interface ExtensionWardApprovalParams extends WardApprovalParams {
  onStatusChange?: (status: string) => void;
  signal?: AbortSignal;
}

export async function requestWardApproval(
  params: ExtensionWardApprovalParams,
): Promise<WardApprovalResult> {
  const client = await getSdkClient();
  return sdkRequestWardApproval(
    client,
    params,
    params.onStatusChange,
    params.signal,
  );
}
