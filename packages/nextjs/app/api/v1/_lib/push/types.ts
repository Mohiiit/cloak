export type WardApprovalEventType =
  | "ward_approval.created"
  | "ward_approval.status_changed"
  | "ward_approval.expired";

export type WardApprovalOutboxStatus =
  | "pending"
  | "processing"
  | "retry"
  | "sent"
  | "dead_letter";

export interface WardApprovalEventOutboxRow {
  id: string;
  approval_id: string;
  event_version: number;
  event_type: WardApprovalEventType;
  target_wallets: string[] | string | null;
  payload: Record<string, unknown> | string | null;
  status: WardApprovalOutboxStatus;
  attempts: number;
  next_attempt_at: string | null;
  processing_until: string | null;
  lease_token: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string | null;
}

export type PushPlatform = "ios" | "android" | "web" | "extension";

export interface PushSubscriptionRow {
  id: string;
  wallet_address: string;
  device_id: string;
  platform: PushPlatform;
  token: string | null;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  is_active: boolean;
  failure_count: number | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  updated_at: string | null;
}

export interface PushDeliveryAttemptRow {
  id: string;
  event_id: string;
  subscription_id: string;
  provider: string;
  platform: PushPlatform;
  attempt_no: number;
  status: "sent" | "failed";
  error_code: string | null;
  error_message: string | null;
  provider_message_id: string | null;
  created_at: string;
}

export interface PushNotificationEnvelope {
  title: string;
  body: string;
  data: {
    schema_version: number;
    event_id: string;
    approval_id: string;
    event_type: WardApprovalEventType;
    event_version: number;
    status?: string;
    previous_status?: string | null;
  };
}

export interface PushDeliveryResult {
  ok: boolean;
  provider: string;
  retryable: boolean;
  deactivateSubscription?: boolean;
  errorCode?: string;
  errorMessage?: string;
  providerMessageId?: string;
}

