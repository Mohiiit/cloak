-- Transaction tracking table for persistent history across all frontends
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  tx_hash text NOT NULL,
  type text NOT NULL,                     -- fund | transfer | withdraw | rollover
  token text NOT NULL,                    -- STRK | ETH | USDC
  amount text,                            -- tongo units as string
  recipient text,                         -- tongo base58 address (transfers only)
  recipient_name text,                    -- display name from contacts
  note text,                              -- user-entered note
  status text NOT NULL DEFAULT 'pending', -- pending | confirmed | failed
  error_message text,
  account_type text NOT NULL DEFAULT 'normal', -- normal | ward | guardian
  ward_address text,                      -- set when guardian submits for a ward
  fee text,                               -- actual fee from receipt
  network text NOT NULL DEFAULT 'sepolia',
  platform text,                          -- mobile | web | extension
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_transactions_wallet ON transactions (wallet_address, created_at DESC);
CREATE INDEX idx_transactions_ward ON transactions (ward_address, created_at DESC);
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_transactions" ON transactions FOR ALL USING (true) WITH CHECK (true);
