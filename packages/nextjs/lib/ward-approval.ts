/**
 * Ward approval pipeline for Cloak web app.
 *
 * Thin wrapper around the SDK ward module.
 * Uses CloakApiClient from api-client.ts and delegates to SDK.
 */

import {
  fetchWardApprovalNeeds,
  requestWardApproval as sdkRequestWardApproval,
  normalizeAddress,
  getProvider,
} from "@cloak-wallet/sdk";
import type {
  WardApprovalNeeds,
  WardApprovalParams,
  WardApprovalResult,
} from "@cloak-wallet/sdk";
import { getClient } from "~~/lib/api-client";

export type { WardApprovalNeeds, WardApprovalParams, WardApprovalResult };
export { normalizeAddress };

// ─── Ward checks ─────────────────────────────────────────────────────────────

export async function checkWardApprovalNeeds(
  wardAddress: string,
): Promise<WardApprovalNeeds | null> {
  return fetchWardApprovalNeeds(getProvider(), wardAddress);
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
