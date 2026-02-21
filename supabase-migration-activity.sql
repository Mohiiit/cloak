-- Activity feed support for guardian + ward approval records.
-- Run in Supabase SQL editor.

-- Canonical amount unit for ward approval requests.
ALTER TABLE ward_approval_requests
  ADD COLUMN IF NOT EXISTS amount_unit TEXT;

-- Guardian activity queries hit guardian_address + created_at.
CREATE INDEX IF NOT EXISTS idx_ward_approvals_guardian_created
  ON ward_approval_requests (guardian_address, created_at DESC);
