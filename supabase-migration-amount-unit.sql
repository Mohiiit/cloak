-- Add amount_unit column to transactions table.
-- Existing records default to 'tongo_units' (backward compatible).
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount_unit TEXT DEFAULT 'tongo_units';

-- Add pseudo_name column to ward_configs table for ward display names.
ALTER TABLE ward_configs ADD COLUMN IF NOT EXISTS pseudo_name TEXT;
