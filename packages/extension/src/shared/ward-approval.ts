/**
 * Ward approval system for Cloak extension.
 *
 * Thin wrapper around the SDK ward module.
 * Constructs a CloakApiClient from chrome.storage config and delegates to SDK.
 */

import {
  checkIfWardAccount as sdkCheckIfWardAccount,
  fetchWardApprovalNeeds,
  requestWardApproval as sdkRequestWardApproval,
  getProvider,
} from "@cloak-wallet/sdk";
import type {
  WardApprovalNeeds,
  WardApprovalParams,
  WardApprovalRequest,
  WardApprovalResult,
} from "@cloak-wallet/sdk";
import { getApiClient } from "./api-config";

export type { WardApprovalNeeds, WardApprovalResult };

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

export interface ExtensionWardApprovalOptions {
  initialStatus?: "pending_ward_sig" | "pending_guardian";
  onRequestCreated?: (request: WardApprovalRequest) => Promise<void> | void;
}

export async function requestWardApproval(
  params: ExtensionWardApprovalParams,
  options?: ExtensionWardApprovalOptions,
): Promise<WardApprovalResult> {
  const client = await getApiClient();
  return sdkRequestWardApproval(
    client,
    params,
    params.onStatusChange,
    params.signal,
    options,
  );
}
