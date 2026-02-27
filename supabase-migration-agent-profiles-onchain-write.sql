-- Agent registration on-chain write outcome persistence
-- Phase 81: chain-first registration writes

ALTER TABLE IF EXISTS agent_profiles
  ADD COLUMN IF NOT EXISTS onchain_write_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS onchain_write_tx_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS onchain_write_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS onchain_write_checked_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_agent_profiles_onchain_write_status
  ON agent_profiles (onchain_write_status);
