-- x402 payment replay and settlement persistence
-- Added for Phase 11 idempotency + replay protection.

CREATE TABLE IF NOT EXISTS x402_payments (
  replay_key text PRIMARY KEY,
  payment_ref text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'settled', 'rejected')),
  settlement_tx_hash text,
  reason_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_x402_payments_payment_ref
  ON x402_payments (payment_ref);

CREATE INDEX IF NOT EXISTS idx_x402_payments_status
  ON x402_payments (status);

