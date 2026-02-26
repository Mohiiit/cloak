-- Marketplace agent run persistence
-- Phase 52: normalize run lifecycle records for billable/non-billable executions.

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  hire_id TEXT NOT NULL REFERENCES agent_hires(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agent_profiles(agent_id) ON DELETE CASCADE,
  hire_operator_wallet TEXT NULL,
  action TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  billable BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL,
  payment_ref TEXT NULL,
  settlement_tx_hash TEXT NULL,
  payment_evidence JSONB NULL,
  agent_trust_snapshot JSONB NULL,
  execution_tx_hashes JSONB NULL,
  result JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_hire_id
  ON agent_runs (hire_id);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_id
  ON agent_runs (agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_runs_hire_operator_wallet
  ON agent_runs (hire_operator_wallet);

CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at
  ON agent_runs (created_at DESC);
