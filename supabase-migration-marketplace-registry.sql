-- Marketplace agent registry + hire lifecycle tables
-- Phase 21: registry lifecycle APIs

CREATE TABLE IF NOT EXISTS agent_profiles (
  id TEXT PRIMARY KEY,
  agent_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NULL,
  agent_type TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  endpoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  pricing JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_uri TEXT NULL,
  operator_wallet TEXT NOT NULL,
  service_wallet TEXT NOT NULL,
  trust_score INTEGER NOT NULL DEFAULT 50,
  trust_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  registry_version TEXT NOT NULL DEFAULT 'erc8004-v1',
  last_indexed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS agent_hires (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agent_profiles(agent_id) ON DELETE CASCADE,
  operator_wallet TEXT NOT NULL,
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  billing_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_profiles_agent_type
  ON agent_profiles (agent_type);

CREATE INDEX IF NOT EXISTS idx_agent_profiles_status
  ON agent_profiles (status);

CREATE INDEX IF NOT EXISTS idx_agent_hires_operator_wallet
  ON agent_hires (operator_wallet);

