-- Cloak 2FA Database Schema
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/inrrwwpzglyywrrumxfr/sql

-- Table for 2FA configuration per wallet
CREATE TABLE IF NOT EXISTS two_factor_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL UNIQUE,
  secondary_public_key text NOT NULL,
  is_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Table for approval requests (web/extension → mobile)
CREATE TABLE IF NOT EXISTS approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  action text NOT NULL,
  token text NOT NULL,
  amount text,
  recipient text,
  calls_json text NOT NULL,
  sig1_json text NOT NULL,
  nonce text NOT NULL,
  resource_bounds_json text DEFAULT '{}',
  tx_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  final_tx_hash text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '5 minutes'),
  responded_at timestamptz
);

-- Enable Row Level Security (open for hackathon demo)
ALTER TABLE two_factor_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

-- Allow all operations (hackathon demo - tighten for production)
CREATE POLICY "allow_all_2fa" ON two_factor_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_approvals" ON approval_requests FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for approval_requests (optional)
-- ALTER PUBLICATION supabase_realtime ADD TABLE approval_requests;
