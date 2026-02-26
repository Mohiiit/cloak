import { randomUUID } from "crypto";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { getSupabase, type SupabaseClient } from "../supabase";
import { getPushDispatchConfig } from "./config";
import { getPushMetricSnapshot, incrementPushMetric } from "./metrics";
import { sendPushNotification } from "./provider";
import type {
  PushDeliveryResult,
  PushNotificationEnvelope,
  PushSubscriptionRow,
  WardApprovalEventOutboxRow,
} from "./types";

interface DispatchOptions {
  maxEvents?: number;
  dryRun?: boolean;
}

export interface DispatchSummary {
  enabled: boolean;
  shadowMode: boolean;
  dryRun: boolean;
  claimed: number;
  sent: number;
  retried: number;
  deadLettered: number;
  skippedNoSubscribers: number;
  deliveriesSent: number;
  deliveriesFailed: number;
  metrics: Record<string, number>;
}

function parseTargetWallets(value: WardApprovalEventOutboxRow["target_wallets"]): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((item): item is string => typeof item === "string" && item.length > 0)
          .map((wallet) => normalizeAddress(wallet)),
      ),
    );
  }
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return parseTargetWallets(parsed);
  } catch {
    return [];
  }
}

function parseEnvelope(
  event: WardApprovalEventOutboxRow,
): PushNotificationEnvelope {
  if (event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)) {
    const payload = event.payload as Record<string, unknown>;
    if (
      typeof payload.title === "string" &&
      typeof payload.body === "string" &&
      typeof payload.data === "object" &&
      payload.data !== null
    ) {
      return payload as unknown as PushNotificationEnvelope;
    }
  }

  if (typeof event.payload === "string") {
    try {
      const parsed = JSON.parse(event.payload);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.title === "string" &&
        typeof parsed.body === "string" &&
        parsed.data
      ) {
        return parsed as PushNotificationEnvelope;
      }
    } catch {
      // fall through to generated payload
    }
  }

  return {
    title: "Ward approval update",
    body: "A ward approval request requires your attention.",
    data: {
      schema_version: 1,
      event_id: event.id,
      approval_id: event.approval_id,
      event_type: event.event_type,
      event_version: event.event_version,
    },
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function computeRetryDelayMs(
  attempts: number,
  baseRetryMs: number,
  maxRetryMs: number,
): number {
  const exponent = Math.max(0, attempts - 1);
  const delay = baseRetryMs * 2 ** exponent;
  return Math.min(delay, maxRetryMs);
}

function buildSummarySeed(configEnabled: boolean, shadowMode: boolean, dryRun: boolean): DispatchSummary {
  return {
    enabled: configEnabled,
    shadowMode,
    dryRun,
    claimed: 0,
    sent: 0,
    retried: 0,
    deadLettered: 0,
    skippedNoSubscribers: 0,
    deliveriesSent: 0,
    deliveriesFailed: 0,
    metrics: getPushMetricSnapshot(),
  };
}

async function releaseExpiredLeases(sb: SupabaseClient): Promise<void> {
  const now = nowIso();
  await sb.update(
    "ward_approval_events_outbox",
    `status=eq.processing&processing_until=lt.${now}`,
    {
      status: "retry",
      lease_token: null,
      processing_until: null,
      next_attempt_at: now,
      updated_at: now,
      last_error: "lease_expired",
    },
  );
}

async function claimDueEvents(
  sb: SupabaseClient,
  batchSize: number,
  leaseSeconds: number,
): Promise<WardApprovalEventOutboxRow[]> {
  const now = nowIso();
  const candidates = await sb.select<WardApprovalEventOutboxRow>(
    "ward_approval_events_outbox",
    `status=in.(pending,retry)&next_attempt_at=lte.${now}`,
    {
      orderBy: "created_at.asc",
      limit: batchSize,
    },
  );

  const claimed: WardApprovalEventOutboxRow[] = [];
  for (const candidate of candidates) {
    const leaseToken = randomUUID();
    const leaseUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    const rows = await sb.update<WardApprovalEventOutboxRow>(
      "ward_approval_events_outbox",
      `id=eq.${candidate.id}&status=in.(pending,retry)`,
      {
        status: "processing",
        lease_token: leaseToken,
        processing_until: leaseUntil,
        updated_at: now,
      },
    );
    if (rows.length > 0) {
      claimed.push(rows[0]);
    }
  }
  return claimed;
}

async function getSubscriptionsForEvent(
  sb: SupabaseClient,
  event: WardApprovalEventOutboxRow,
): Promise<PushSubscriptionRow[]> {
  const wallets = parseTargetWallets(event.target_wallets);
  if (wallets.length === 0) return [];

  const filter = `wallet_address=in.(${wallets.join(",")})&is_active=eq.true`;
  const rows = await sb.select<PushSubscriptionRow>("push_subscriptions", filter, {
    orderBy: "updated_at.desc",
  });

  // Deduplicate by subscription id
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.id || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

async function recordDeliveryAttempt(input: {
  sb: SupabaseClient;
  event: WardApprovalEventOutboxRow;
  subscription: PushSubscriptionRow;
  attemptNo: number;
  result: PushDeliveryResult;
}): Promise<void> {
  await input.sb.insert("push_delivery_attempts", {
    id: randomUUID(),
    event_id: input.event.id,
    subscription_id: input.subscription.id,
    provider: input.result.provider,
    platform: input.subscription.platform,
    attempt_no: input.attemptNo,
    status: input.result.ok ? "sent" : "failed",
    error_code: input.result.errorCode ?? null,
    error_message: input.result.errorMessage ?? null,
    provider_message_id: input.result.providerMessageId ?? null,
    created_at: nowIso(),
  });
}

async function updateSubscriptionFromResult(input: {
  sb: SupabaseClient;
  subscription: PushSubscriptionRow;
  result: PushDeliveryResult;
}): Promise<void> {
  const now = nowIso();
  const baseUpdate: Record<string, unknown> = {
    updated_at: now,
  };

  if (input.result.ok) {
    baseUpdate.last_success_at = now;
    baseUpdate.failure_count = 0;
    baseUpdate.last_error = null;
  } else {
    const nextFailures = (input.subscription.failure_count || 0) + 1;
    baseUpdate.last_failure_at = now;
    baseUpdate.failure_count = nextFailures;
    baseUpdate.last_error = input.result.errorMessage || input.result.errorCode || "push_failed";
    if (input.result.deactivateSubscription) {
      baseUpdate.is_active = false;
    }
  }

  await input.sb.update(
    "push_subscriptions",
    `id=eq.${input.subscription.id}`,
    baseUpdate,
  );
}

async function markEventSent(
  sb: SupabaseClient,
  event: WardApprovalEventOutboxRow,
  attempts: number,
  lastError: string | null,
): Promise<void> {
  const now = nowIso();
  await sb.update(
    "ward_approval_events_outbox",
    `id=eq.${event.id}&lease_token=eq.${event.lease_token}`,
    {
      status: "sent",
      attempts,
      next_attempt_at: null,
      processing_until: null,
      lease_token: null,
      last_error: lastError,
      updated_at: now,
    },
  );
}

async function markEventRetry(
  sb: SupabaseClient,
  event: WardApprovalEventOutboxRow,
  attempts: number,
  delayMs: number,
  lastError: string,
): Promise<void> {
  const now = nowIso();
  const retryAt = new Date(Date.now() + delayMs).toISOString();
  await sb.update(
    "ward_approval_events_outbox",
    `id=eq.${event.id}&lease_token=eq.${event.lease_token}`,
    {
      status: "retry",
      attempts,
      next_attempt_at: retryAt,
      processing_until: null,
      lease_token: null,
      last_error: lastError,
      updated_at: now,
    },
  );
}

async function markEventDeadLetter(
  sb: SupabaseClient,
  event: WardApprovalEventOutboxRow,
  attempts: number,
  lastError: string,
): Promise<void> {
  const now = nowIso();
  await sb.update(
    "ward_approval_events_outbox",
    `id=eq.${event.id}&lease_token=eq.${event.lease_token}`,
    {
      status: "dead_letter",
      attempts,
      next_attempt_at: null,
      processing_until: null,
      lease_token: null,
      last_error: lastError,
      updated_at: now,
    },
  );
}

async function processEvent(input: {
  sb: SupabaseClient;
  event: WardApprovalEventOutboxRow;
  dryRun: boolean;
}): Promise<{
  state: "sent" | "retry" | "dead_letter";
  sent: number;
  failed: number;
  skippedNoSubscribers: boolean;
}> {
  const config = getPushDispatchConfig();
  const subscriptions = await getSubscriptionsForEvent(input.sb, input.event);
  const attemptNo = (input.event.attempts || 0) + 1;

  if (subscriptions.length === 0) {
    await markEventSent(input.sb, input.event, attemptNo, "no_active_subscriptions");
    return {
      state: "sent",
      sent: 0,
      failed: 0,
      skippedNoSubscribers: true,
    };
  }

  const envelope = parseEnvelope(input.event);
  const results: PushDeliveryResult[] = [];
  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    const result = await sendPushNotification({
      subscription,
      notification: envelope,
      config,
      dryRun: input.dryRun,
    });
    results.push(result);

    await recordDeliveryAttempt({
      sb: input.sb,
      event: input.event,
      subscription,
      attemptNo,
      result,
    });
    await updateSubscriptionFromResult({
      sb: input.sb,
      subscription,
      result,
    });

    if (result.ok) {
      sent += 1;
      incrementPushMetric("deliveries_sent");
    } else {
      failed += 1;
      incrementPushMetric("deliveries_failed");
    }
  }

  const anySuccess = results.some((result) => result.ok);
  const anyRetryableFailure = results.some(
    (result) => !result.ok && result.retryable,
  );
  const firstError =
    results.find((result) => !result.ok)?.errorMessage ||
    results.find((result) => !result.ok)?.errorCode ||
    "push_dispatch_failed";

  if (anySuccess) {
    await markEventSent(input.sb, input.event, attemptNo, failed > 0 ? firstError : null);
    return {
      state: "sent",
      sent,
      failed,
      skippedNoSubscribers: false,
    };
  }

  if (anyRetryableFailure && attemptNo < config.maxAttempts) {
    const delay = computeRetryDelayMs(
      attemptNo,
      config.baseRetryMs,
      config.maxRetryMs,
    );
    await markEventRetry(input.sb, input.event, attemptNo, delay, firstError);
    return {
      state: "retry",
      sent,
      failed,
      skippedNoSubscribers: false,
    };
  }

  await markEventDeadLetter(input.sb, input.event, attemptNo, firstError);
  return {
    state: "dead_letter",
    sent,
    failed,
    skippedNoSubscribers: false,
  };
}

export async function retryDeadLetterEvent(input: {
  eventId: string;
}): Promise<WardApprovalEventOutboxRow | null> {
  const sb = getSupabase();
  const rows = await sb.update<WardApprovalEventOutboxRow>(
    "ward_approval_events_outbox",
    `id=eq.${input.eventId}&status=eq.dead_letter`,
    {
      status: "retry",
      next_attempt_at: nowIso(),
      processing_until: null,
      lease_token: null,
      updated_at: nowIso(),
      last_error: null,
    },
  );
  return rows[0] || null;
}

export async function dispatchWardApprovalPushEvents(
  options: DispatchOptions = {},
): Promise<DispatchSummary> {
  const config = getPushDispatchConfig();
  const dryRun = !!options.dryRun;
  const summary = buildSummarySeed(config.enabled, config.shadowMode, dryRun);

  if (!config.enabled) {
    return summary;
  }

  const sb = getSupabase();
  await releaseExpiredLeases(sb);

  const maxEvents = Math.max(1, Math.min(options.maxEvents || config.batchSize, 200));
  const claimed = await claimDueEvents(sb, maxEvents, config.leaseSeconds);
  summary.claimed = claimed.length;
  incrementPushMetric("dispatch_cycles");
  incrementPushMetric("events_claimed", claimed.length);

  for (const event of claimed) {
    try {
      const result = await processEvent({
        sb,
        event,
        dryRun,
      });
      summary.deliveriesSent += result.sent;
      summary.deliveriesFailed += result.failed;
      if (result.skippedNoSubscribers) {
        summary.skippedNoSubscribers += 1;
      }
      if (result.state === "sent") {
        summary.sent += 1;
        incrementPushMetric("events_sent");
      } else if (result.state === "retry") {
        summary.retried += 1;
        incrementPushMetric("events_retry");
      } else {
        summary.deadLettered += 1;
        incrementPushMetric("events_dead_letter");
      }
    } catch (error) {
      // Safety net: mark failed events for retry unless attempts exhausted.
      const attempts = (event.attempts || 0) + 1;
      const message =
        (error as { message?: string })?.message || "dispatcher_unhandled_error";
      if (attempts >= config.maxAttempts) {
        await markEventDeadLetter(sb, event, attempts, message);
        summary.deadLettered += 1;
        incrementPushMetric("events_dead_letter");
      } else {
        const delay = computeRetryDelayMs(
          attempts,
          config.baseRetryMs,
          config.maxRetryMs,
        );
        await markEventRetry(sb, event, attempts, delay, message);
        summary.retried += 1;
        incrementPushMetric("events_retry");
      }
      summary.deliveriesFailed += 1;
      incrementPushMetric("deliveries_failed");
    }
  }

  summary.metrics = getPushMetricSnapshot();
  return summary;
}

