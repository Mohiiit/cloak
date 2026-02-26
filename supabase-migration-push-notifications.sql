-- Push-first ward approval notifications
-- Adds durable outbox + delivery tracking + push subscription hardening.

-- 1) Ensure ward approvals have update/version metadata for event sequencing.
ALTER TABLE ward_approval_requests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS event_version INTEGER;

UPDATE ward_approval_requests
SET
  updated_at = COALESCE(updated_at, created_at, NOW()),
  event_version = COALESCE(event_version, 1)
WHERE updated_at IS NULL OR event_version IS NULL;

ALTER TABLE ward_approval_requests
  ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ward_approvals_updated
  ON ward_approval_requests (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ward_approvals_pending_updated
  ON ward_approval_requests (status, updated_at DESC);

-- 2) Push subscriptions table (if missing) + reliability columns.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web', 'extension')),
  device_id TEXT NOT NULL,
  token TEXT NULL,
  endpoint TEXT NULL,
  p256dh TEXT NULL,
  auth TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ NULL,
  last_failure_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wallet_address, device_id)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_push_subscriptions" ON push_subscriptions;
CREATE POLICY "service_role_all_push_subscriptions"
  ON push_subscriptions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_wallet_active
  ON push_subscriptions (wallet_address, is_active);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_platform_active
  ON push_subscriptions (platform, is_active);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated
  ON push_subscriptions (updated_at DESC);

-- 3) Outbox events for durable notification dispatch.
CREATE TABLE IF NOT EXISTS ward_approval_events_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL REFERENCES ward_approval_requests(id) ON DELETE CASCADE,
  event_version INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('ward_approval.created', 'ward_approval.status_changed', 'ward_approval.expired')
  ),
  target_wallets JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'retry', 'sent', 'dead_letter')
  ),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_until TIMESTAMPTZ NULL,
  lease_token UUID NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(approval_id, event_version, event_type)
);

ALTER TABLE ward_approval_events_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_ward_approval_events_outbox" ON ward_approval_events_outbox;
CREATE POLICY "service_role_all_ward_approval_events_outbox"
  ON ward_approval_events_outbox
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_ward_outbox_dispatch_due
  ON ward_approval_events_outbox (status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_ward_outbox_processing
  ON ward_approval_events_outbox (status, processing_until);

-- 4) Delivery attempt ledger (per event x subscription).
CREATE TABLE IF NOT EXISTS push_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES ward_approval_events_outbox(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  platform TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_code TEXT NULL,
  error_message TEXT NULL,
  provider_message_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, subscription_id, attempt_no)
);

ALTER TABLE push_delivery_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_push_delivery_attempts" ON push_delivery_attempts;
CREATE POLICY "service_role_all_push_delivery_attempts"
  ON push_delivery_attempts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_push_delivery_event
  ON push_delivery_attempts (event_id, created_at DESC);
