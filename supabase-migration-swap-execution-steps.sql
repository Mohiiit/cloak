-- Extend swap execution storage from single-tx records to execution + step timeline records.

ALTER TABLE IF EXISTS swap_executions
  ADD COLUMN IF NOT EXISTS execution_id text,
  ADD COLUMN IF NOT EXISTS tx_hashes jsonb,
  ADD COLUMN IF NOT EXISTS primary_tx_hash text,
  ADD COLUMN IF NOT EXISTS failure_step_key text,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS route_meta jsonb;

UPDATE swap_executions
SET execution_id = COALESCE(
  execution_id,
  CONCAT('swap_', EXTRACT(EPOCH FROM COALESCE(created_at, now()))::bigint::text, '_', SUBSTRING(COALESCE(tx_hash, id::text) FROM 1 FOR 12))
)
WHERE execution_id IS NULL;

UPDATE swap_executions
SET primary_tx_hash = COALESCE(primary_tx_hash, tx_hash)
WHERE primary_tx_hash IS NULL;

UPDATE swap_executions
SET tx_hashes = COALESCE(tx_hashes, CASE WHEN tx_hash IS NOT NULL THEN jsonb_build_array(tx_hash) ELSE NULL END)
WHERE tx_hashes IS NULL;

ALTER TABLE IF EXISTS swap_executions
  ALTER COLUMN execution_id SET NOT NULL;

ALTER TABLE IF EXISTS swap_executions
  ALTER COLUMN tx_hash DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_swap_executions_execution_id
  ON swap_executions (execution_id);

CREATE INDEX IF NOT EXISTS idx_swap_executions_wallet_status_created
  ON swap_executions (wallet_address, status, created_at DESC);

CREATE TABLE IF NOT EXISTS swap_execution_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id text NOT NULL REFERENCES swap_executions(execution_id) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_order integer NOT NULL DEFAULT 0,
  attempt integer NOT NULL DEFAULT 1,
  status text NOT NULL,
  tx_hash text,
  message text,
  metadata jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (execution_id, step_key, attempt)
);

CREATE INDEX IF NOT EXISTS idx_swap_execution_steps_execution_order
  ON swap_execution_steps (execution_id, step_order, created_at);

CREATE INDEX IF NOT EXISTS idx_swap_execution_steps_tx_hash
  ON swap_execution_steps (tx_hash);

-- Backfill a minimal timeline for existing rows.
INSERT INTO swap_execution_steps (
  execution_id,
  step_key,
  step_order,
  attempt,
  status,
  tx_hash,
  message,
  started_at,
  finished_at
)
SELECT
  execution_id,
  'submit' AS step_key,
  8 AS step_order,
  1 AS attempt,
  CASE
    WHEN status = 'confirmed' THEN 'success'
    WHEN status = 'failed' THEN 'failed'
    ELSE 'running'
  END AS status,
  tx_hash,
  CASE
    WHEN status = 'failed' THEN COALESCE(error_message, failure_reason, 'Execution failed')
    ELSE NULL
  END AS message,
  created_at,
  CASE
    WHEN status IN ('confirmed', 'failed') THEN updated_at
    ELSE NULL
  END AS finished_at
FROM swap_executions
ON CONFLICT (execution_id, step_key, attempt) DO NOTHING;

ALTER TABLE swap_execution_steps ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  CREATE POLICY "allow_all_swap_execution_steps"
    ON swap_execution_steps FOR ALL USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
