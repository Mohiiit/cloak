-- x402 payments v2: strict tongo proof envelope + settlement lifecycle metadata
-- Phase 81-86 follow-up migration for on-chain coupling.

ALTER TABLE x402_payments
  ADD COLUMN IF NOT EXISTS challenge_id text,
  ADD COLUMN IF NOT EXISTS payer_address text,
  ADD COLUMN IF NOT EXISTS recipient_address text,
  ADD COLUMN IF NOT EXISTS token_address text,
  ADD COLUMN IF NOT EXISTS amount text,
  ADD COLUMN IF NOT EXISTS proof_digest text,
  ADD COLUMN IF NOT EXISTS network text,
  ADD COLUMN IF NOT EXISTS state text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;

CREATE INDEX IF NOT EXISTS idx_x402_payments_challenge_id
  ON x402_payments (challenge_id);

CREATE INDEX IF NOT EXISTS idx_x402_payments_state
  ON x402_payments (state);

CREATE INDEX IF NOT EXISTS idx_x402_payments_settled_at
  ON x402_payments (settled_at DESC);

