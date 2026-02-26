import { randomUUID } from "crypto";
import { normalizeAddress } from "@cloak-wallet/sdk";
import type { SupabaseClient } from "../supabase";
import { incrementPushMetric } from "./metrics";
import type { PushNotificationEnvelope, WardApprovalEventType } from "./types";

interface WardApprovalEventSource {
  id: string;
  ward_address: string;
  guardian_address: string;
  action: string;
  token: string;
  status: string;
  event_version?: number | null;
}

function buildNotificationText(
  eventType: WardApprovalEventType,
  status: string,
): { title: string; body: string } {
  if (eventType === "ward_approval.created") {
    return {
      title: "Ward approval required",
      body: "A new ward approval request is waiting for action.",
    };
  }

  if (status === "pending_guardian") {
    return {
      title: "Guardian approval required",
      body: "Ward signature received. Guardian approval is now needed.",
    };
  }

  if (status === "approved") {
    return {
      title: "Ward approval completed",
      body: "The ward approval request has been approved.",
    };
  }

  if (status === "rejected") {
    return {
      title: "Ward approval rejected",
      body: "The ward approval request was rejected.",
    };
  }

  if (status === "expired") {
    return {
      title: "Ward approval expired",
      body: "The ward approval request expired before completion.",
    };
  }

  if (status === "failed" || status === "gas_error") {
    return {
      title: "Ward approval failed",
      body: "The ward approval request failed and requires attention.",
    };
  }

  return {
    title: "Ward approval updated",
    body: "The ward approval request status has changed.",
  };
}

function uniqueWallets(source: WardApprovalEventSource): string[] {
  return Array.from(
    new Set(
      [source.ward_address, source.guardian_address]
        .filter(Boolean)
        .map((value) => normalizeAddress(value)),
    ),
  );
}

function clampEventVersion(value: number | null | undefined): number {
  if (value === null || value === undefined) return 1;
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.trunc(value));
}

function buildEnvelope(input: {
  eventId: string;
  eventType: WardApprovalEventType;
  row: WardApprovalEventSource;
  previousStatus?: string | null;
}): PushNotificationEnvelope {
  const text = buildNotificationText(input.eventType, input.row.status);
  return {
    title: text.title,
    body: text.body,
    data: {
      schema_version: 1,
      event_id: input.eventId,
      approval_id: input.row.id,
      event_type: input.eventType,
      event_version: clampEventVersion(input.row.event_version),
      status: input.row.status,
      previous_status: input.previousStatus ?? null,
    },
  };
}

export async function enqueueWardApprovalEvent(input: {
  sb: SupabaseClient;
  row: WardApprovalEventSource;
  eventType: WardApprovalEventType;
  previousStatus?: string | null;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const eventId = randomUUID();
  const payload = buildEnvelope({
    eventId,
    eventType: input.eventType,
    row: input.row,
    previousStatus: input.previousStatus,
  });

  await input.sb.upsert(
    "ward_approval_events_outbox",
    {
      id: eventId,
      approval_id: input.row.id,
      event_version: clampEventVersion(input.row.event_version),
      event_type: input.eventType,
      target_wallets: uniqueWallets(input.row),
      payload,
      status: "pending",
      attempts: 0,
      next_attempt_at: nowIso,
      processing_until: null,
      lease_token: null,
      last_error: null,
      created_at: nowIso,
      updated_at: nowIso,
    },
    "approval_id,event_version,event_type",
  );

  incrementPushMetric("outbox_enqueued");
}

