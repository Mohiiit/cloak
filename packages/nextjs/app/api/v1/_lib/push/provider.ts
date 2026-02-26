import webpush from "web-push";
import type { PushDispatchConfig } from "./config";
import type {
  PushDeliveryResult,
  PushNotificationEnvelope,
  PushSubscriptionRow,
} from "./types";

let webPushConfigured = false;

function ensureWebPushConfigured(config: PushDispatchConfig): boolean {
  if (webPushConfigured) return true;
  if (
    !config.vapidPublicKey ||
    !config.vapidPrivateKey ||
    !config.vapidSubject
  ) {
    return false;
  }
  webpush.setVapidDetails(
    config.vapidSubject,
    config.vapidPublicKey,
    config.vapidPrivateKey,
  );
  webPushConfigured = true;
  return true;
}

function classifyHttpError(
  status: number,
  fallbackMessage: string,
): { retryable: boolean; deactivateSubscription?: boolean; errorCode: string } {
  if (status === 404 || status === 410) {
    return {
      retryable: false,
      deactivateSubscription: true,
      errorCode: "SUBSCRIPTION_GONE",
    };
  }
  if (status === 400 || status === 401 || status === 403) {
    return { retryable: false, errorCode: "REQUEST_REJECTED" };
  }
  if (status === 429 || status >= 500) {
    return { retryable: true, errorCode: "PROVIDER_TEMPORARY_FAILURE" };
  }
  return { retryable: false, errorCode: fallbackMessage };
}

async function sendWebPush(input: {
  subscription: PushSubscriptionRow;
  notification: PushNotificationEnvelope;
  config: PushDispatchConfig;
  dryRun: boolean;
}): Promise<PushDeliveryResult> {
  if (input.dryRun || input.config.shadowMode) {
    return { ok: true, provider: "webpush", retryable: false };
  }

  if (!ensureWebPushConfigured(input.config)) {
    return {
      ok: false,
      provider: "webpush",
      retryable: false,
      errorCode: "WEB_PUSH_NOT_CONFIGURED",
      errorMessage: "Missing VAPID configuration for web push",
    };
  }

  if (!input.subscription.endpoint || !input.subscription.p256dh || !input.subscription.auth) {
    return {
      ok: false,
      provider: "webpush",
      retryable: false,
      errorCode: "INVALID_WEB_PUSH_SUBSCRIPTION",
      errorMessage: "Subscription is missing endpoint or keys",
      deactivateSubscription: true,
    };
  }

  try {
    const response = await webpush.sendNotification(
      {
        endpoint: input.subscription.endpoint,
        keys: {
          p256dh: input.subscription.p256dh,
          auth: input.subscription.auth,
        },
      },
      JSON.stringify(input.notification),
      {
        TTL: 120,
        urgency: "high",
      },
    );

    return {
      ok: true,
      provider: "webpush",
      retryable: false,
      providerMessageId:
        (response as { headers?: Record<string, string> }).headers?.["x-request-id"] || null || undefined,
    };
  } catch (error) {
    const err = error as { statusCode?: number; message?: string; body?: string };
    const statusCode = err.statusCode ?? 0;
    const classified = classifyHttpError(statusCode, "WEB_PUSH_ERROR");
    return {
      ok: false,
      provider: "webpush",
      retryable: classified.retryable,
      deactivateSubscription: classified.deactivateSubscription,
      errorCode: classified.errorCode,
      errorMessage: err.body || err.message || "Web push dispatch failed",
    };
  }
}

async function sendExpoPush(input: {
  subscription: PushSubscriptionRow;
  notification: PushNotificationEnvelope;
  config: PushDispatchConfig;
  dryRun: boolean;
}): Promise<PushDeliveryResult> {
  if (input.dryRun || input.config.shadowMode) {
    return { ok: true, provider: "expo", retryable: false };
  }
  if (!input.subscription.token) {
    return {
      ok: false,
      provider: "expo",
      retryable: false,
      errorCode: "MISSING_DEVICE_TOKEN",
      errorMessage: "Token-based subscription missing token",
      deactivateSubscription: true,
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (input.config.expoAccessToken) {
    headers.Authorization = `Bearer ${input.config.expoAccessToken}`;
  }

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: input.subscription.token,
        title: input.notification.title,
        body: input.notification.body,
        data: input.notification.data,
        priority: "high",
      }),
    });

    const payload = await res
      .json()
      .catch(() => ({ data: { status: "error", message: "invalid_json" } }));

    if (!res.ok) {
      const classified = classifyHttpError(res.status, "EXPO_HTTP_ERROR");
      return {
        ok: false,
        provider: "expo",
        retryable: classified.retryable,
        deactivateSubscription: classified.deactivateSubscription,
        errorCode: classified.errorCode,
        errorMessage: `Expo push HTTP ${res.status}`,
      };
    }

    const first = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
    if (first?.status === "ok") {
      return {
        ok: true,
        provider: "expo",
        retryable: false,
        providerMessageId: first?.id,
      };
    }

    const details = first?.details || {};
    const message =
      first?.message || details?.error || "Expo push rejected notification";
    const notRegistered =
      details?.error === "DeviceNotRegistered" ||
      typeof message === "string" && message.includes("DeviceNotRegistered");

    return {
      ok: false,
      provider: "expo",
      retryable: false,
      deactivateSubscription: notRegistered,
      errorCode: notRegistered ? "DEVICE_NOT_REGISTERED" : "EXPO_REJECTED",
      errorMessage: String(message),
    };
  } catch (error) {
    return {
      ok: false,
      provider: "expo",
      retryable: true,
      errorCode: "EXPO_NETWORK_ERROR",
      errorMessage:
        (error as { message?: string })?.message || "Expo dispatch failed",
    };
  }
}

async function sendGenericTokenPush(input: {
  subscription: PushSubscriptionRow;
  notification: PushNotificationEnvelope;
  config: PushDispatchConfig;
  dryRun: boolean;
}): Promise<PushDeliveryResult> {
  if (input.dryRun || input.config.shadowMode) {
    return { ok: true, provider: "generic", retryable: false };
  }

  if (!input.config.tokenProviderUrl) {
    return {
      ok: false,
      provider: "generic",
      retryable: false,
      errorCode: "GENERIC_PROVIDER_NOT_CONFIGURED",
      errorMessage: "Missing PUSH_TOKEN_PROVIDER_URL",
    };
  }

  if (!input.subscription.token) {
    return {
      ok: false,
      provider: "generic",
      retryable: false,
      errorCode: "MISSING_DEVICE_TOKEN",
      errorMessage: "Token-based subscription missing token",
      deactivateSubscription: true,
    };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (input.config.tokenProviderAuthHeader) {
    headers.Authorization = input.config.tokenProviderAuthHeader;
  }

  try {
    const res = await fetch(input.config.tokenProviderUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        token: input.subscription.token,
        platform: input.subscription.platform,
        notification: input.notification,
      }),
    });

    if (!res.ok) {
      const classified = classifyHttpError(res.status, "GENERIC_HTTP_ERROR");
      return {
        ok: false,
        provider: "generic",
        retryable: classified.retryable,
        deactivateSubscription: classified.deactivateSubscription,
        errorCode: classified.errorCode,
        errorMessage: `Generic provider HTTP ${res.status}`,
      };
    }

    const body = await res.json().catch(() => ({}));
    return {
      ok: true,
      provider: "generic",
      retryable: false,
      providerMessageId:
        typeof body?.message_id === "string" ? body.message_id : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      provider: "generic",
      retryable: true,
      errorCode: "GENERIC_NETWORK_ERROR",
      errorMessage:
        (error as { message?: string })?.message || "Generic provider dispatch failed",
    };
  }
}

export async function sendPushNotification(input: {
  subscription: PushSubscriptionRow;
  notification: PushNotificationEnvelope;
  config: PushDispatchConfig;
  dryRun: boolean;
}): Promise<PushDeliveryResult> {
  if (input.subscription.platform === "web" || input.subscription.platform === "extension") {
    return sendWebPush(input);
  }

  if (input.config.tokenProvider === "expo") {
    return sendExpoPush(input);
  }
  if (input.config.tokenProvider === "generic") {
    return sendGenericTokenPush(input);
  }

  return {
    ok: false,
    provider: "none",
    retryable: false,
    errorCode: "TOKEN_PROVIDER_NOT_CONFIGURED",
    errorMessage:
      "Token-based push provider is not configured. Set PUSH_TOKEN_PROVIDER to expo or generic.",
  };
}

