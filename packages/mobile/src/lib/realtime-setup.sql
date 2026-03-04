-- Supabase Realtime Setup
-- Run these in Supabase Dashboard > SQL Editor
--
-- Part 1: Enable RLS (required for Realtime)
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ward_approval_requests ENABLE ROW LEVEL SECURITY;

-- Part 2: Permissive SELECT policies (anon key needs RLS policies to read)
-- Service role bypasses RLS, so backend writes are unaffected.
CREATE POLICY "allow_select_approval_requests" ON approval_requests
  FOR SELECT USING (true);

CREATE POLICY "allow_select_ward_approval_requests" ON ward_approval_requests
  FOR SELECT USING (true);

-- Part 3: Enable Realtime CDC on these tables
ALTER PUBLICATION supabase_realtime ADD TABLE approval_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE ward_approval_requests;
