-- Shielded swap execution records for typed activity/feed surfaces.

CREATE TABLE IF NOT EXISTS swap_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  ward_address text,
  tx_hash text NOT NULL UNIQUE,
  provider text NOT NULL DEFAULT 'avnu',
  sell_token text NOT NULL,
  buy_token text NOT NULL,
  sell_amount_wei text NOT NULL,
  estimated_buy_amount_wei text NOT NULL,
  min_buy_amount_wei text NOT NULL,
  buy_actual_amount_wei text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swap_executions_wallet_created
  ON swap_executions (wallet_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_swap_executions_ward_created
  ON swap_executions (ward_address, created_at DESC);

ALTER TABLE swap_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_swap_executions"
  ON swap_executions FOR ALL USING (true) WITH CHECK (true);
