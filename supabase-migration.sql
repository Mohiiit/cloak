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

-- ─── Ward / Guardian System ────────────────────────────────────────────

-- Ward-Guardian relationships
CREATE TABLE IF NOT EXISTS ward_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_address text NOT NULL UNIQUE,
  guardian_address text NOT NULL,
  ward_public_key text NOT NULL,
  guardian_public_key text NOT NULL,
  status text DEFAULT 'active',           -- active, frozen, removed
  spending_limit_per_tx text,             -- daily limit in human-readable STRK (null = unlimited)
  max_per_tx text,                        -- max per single transaction in human-readable STRK (null = unlimited)
  require_guardian_for_all boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ward invitation tokens (for QR code linking)
CREATE TABLE IF NOT EXISTS ward_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code text UNIQUE NOT NULL,
  ward_address text NOT NULL,
  ward_public_key text NOT NULL,
  guardian_address text NOT NULL,
  ward_private_key_encrypted text,        -- encrypted for QR transport
  status text DEFAULT 'pending',          -- pending, claimed, expired
  created_at timestamptz DEFAULT now(),
  claimed_at timestamptz
);

-- Enable RLS (open for hackathon demo)
ALTER TABLE ward_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ward_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_wards" ON ward_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_ward_invites" ON ward_invites FOR ALL USING (true) WITH CHECK (true);

-- ─── Ward Approval Requests (multi-sig transaction pipeline) ─────────

-- Tracks multi-party signature collection for ward transactions:
-- ward web signs → ward mobile 2FA → guardian mobile → on-chain submit
CREATE TABLE IF NOT EXISTS ward_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_address text NOT NULL,
  guardian_address text NOT NULL,
  action text NOT NULL,                           -- shield, transfer, withdraw, rollover, invoke
  token text NOT NULL,
  amount text,
  recipient text,
  calls_json text NOT NULL,
  nonce text NOT NULL,
  resource_bounds_json text NOT NULL DEFAULT '{}',
  tx_hash text NOT NULL,                          -- pre-computed invoke tx hash
  ward_sig_json text,                             -- JSON: ["r_hex", "s_hex"]
  ward_2fa_sig_json text,
  guardian_sig_json text,
  guardian_2fa_sig_json text,
  needs_ward_2fa boolean DEFAULT false,
  needs_guardian boolean DEFAULT false,
  needs_guardian_2fa boolean DEFAULT false,
  status text NOT NULL DEFAULT 'pending_ward_sig', -- pending_ward_sig, pending_guardian, approved, rejected, failed, expired
  final_tx_hash text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '10 minutes'),
  responded_at timestamptz
);

ALTER TABLE ward_approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_ward_approvals" ON ward_approval_requests FOR ALL USING (true) WITH CHECK (true);
