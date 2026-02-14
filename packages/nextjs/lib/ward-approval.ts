/**
 * Ward approval pipeline for Cloak web app.
 *
 * Thin wrapper around the SDK ward module.
 * Constructs a SupabaseLite from localStorage config and delegates to SDK.
 */

import {
  SupabaseLite,
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
import { getSupabaseConfig } from "~~/lib/two-factor";

export type { WardApprovalNeeds, WardApprovalParams, WardApprovalResult };
export { normalizeAddress };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClient(): SupabaseLite {
  const { url, key } = getSupabaseConfig();
  return new SupabaseLite(url, key);
}

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
