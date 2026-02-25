-- Quick security hardening for public Supabase project usage.
-- Goal: stop anonymous/public-key clients from reading or writing sensitive tables.
--
-- IMPORTANT:
-- 1) This will break direct browser/mobile writes that use publishable/anon keys.
-- 2) Keep app traffic working by routing DB writes/reads through a trusted server
--    (or Supabase Edge Function) that uses the service role key.

-- Ensure RLS is enabled everywhere.
ALTER TABLE IF EXISTS two_factor_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ward_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ward_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ward_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS swap_executions ENABLE ROW LEVEL SECURITY;

-- Remove existing permissive policies.
DROP POLICY IF EXISTS "allow_all_2fa" ON two_factor_configs;
DROP POLICY IF EXISTS "allow_all_approvals" ON approval_requests;
DROP POLICY IF EXISTS "allow_all_wards" ON ward_configs;
DROP POLICY IF EXISTS "allow_all_ward_invites" ON ward_invites;
DROP POLICY IF EXISTS "allow_all_ward_approvals" ON ward_approval_requests;
DROP POLICY IF EXISTS "allow_all_transactions" ON transactions;
DROP POLICY IF EXISTS "allow_all_swap_executions" ON swap_executions;

-- Remove any previous hardened policies (idempotent reruns).
DROP POLICY IF EXISTS "service_role_all_two_factor_configs" ON two_factor_configs;
DROP POLICY IF EXISTS "service_role_all_approval_requests" ON approval_requests;
DROP POLICY IF EXISTS "service_role_all_ward_configs" ON ward_configs;
DROP POLICY IF EXISTS "service_role_all_ward_invites" ON ward_invites;
DROP POLICY IF EXISTS "service_role_all_ward_approval_requests" ON ward_approval_requests;
DROP POLICY IF EXISTS "service_role_all_transactions" ON transactions;
DROP POLICY IF EXISTS "service_role_all_swap_executions" ON swap_executions;

-- Allow full access only to service_role.
CREATE POLICY "service_role_all_two_factor_configs"
  ON two_factor_configs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_all_approval_requests"
  ON approval_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_all_ward_configs"
  ON ward_configs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_all_ward_invites"
  ON ward_invites
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_all_ward_approval_requests"
  ON ward_approval_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_all_transactions"
  ON transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_all_swap_executions"
  ON swap_executions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
