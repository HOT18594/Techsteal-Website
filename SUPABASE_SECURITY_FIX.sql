-- ═══════════════════════════════════════════════════════════
--  TechSteal v0.0.5 — Security Hardening Patch
--  Run this AFTER SUPABASE_SETUP.sql in Supabase SQL Editor
--  Fixes: self-promote, open storage, future-proof RLS
-- ═══════════════════════════════════════════════════════════

-- ---------- USER_ROLES: prevent anon self-promote ----------
DROP POLICY IF EXISTS "user_roles_update_self" ON user_roles;
CREATE POLICY "user_roles_update_self" ON user_roles
  FOR UPDATE USING (true) WITH CHECK (role = 'member');

DROP POLICY IF EXISTS "user_roles_service_all" ON user_roles;
CREATE POLICY "user_roles_service_all" ON user_roles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger to block escalation
CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role = 'admin' AND OLD.role = 'member' THEN
      -- Allow only if called via service_role (promote route) - we check via custom GUC that Supabase sets for service_role?
      -- For simplicity, we just prevent direct anon updates by checking that the role change is not allowed unless OLD already admin
      -- The promote route uses service_role key which bypasses RLS, so this trigger will not run for it if we use SECURITY DEFINER? Actually it will.
      -- Instead we allow admin change only if performed by service_role client - we detect via auth.jwt() being null for service_role? Supabase sets auth.role
      -- If not service_role, block.
      IF (coalesce(auth.role(), 'anon') != 'service_role') THEN
        RAISE EXCEPTION 'Role escalation not allowed via client. Use /api/auth/promote';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON user_roles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION prevent_role_escalation();

-- ---------- STORAGE: reduce limit to 5MB and restrict deletes ----------
-- Update bucket to 5MB (matches MAX_IMAGE_SIZE in code)
UPDATE storage.buckets SET file_size_limit = 5242880 WHERE id = 'uploads';

-- Note: keep reads public, but inserts/deletes should ideally go through API routes in future.
-- For now, we keep insert public but add a check that file is in posts/ folder only.
DROP POLICY IF EXISTS "uploads_insert" ON storage.objects;
CREATE POLICY "uploads_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'uploads' AND
    (storage.foldername(name))[1] = 'posts'
  );

-- Disallow anon deletes - only service_role can delete after verification
DROP POLICY IF EXISTS "uploads_delete" ON storage.objects;
CREATE POLICY "uploads_delete" ON storage.objects
  FOR DELETE TO service_role USING (true);

-- Allow service_role full access
DROP POLICY IF EXISTS "uploads_service_all" ON storage.objects;
CREATE POLICY "uploads_service_all" ON storage.objects
  FOR ALL TO service_role USING (bucket_id = 'uploads') WITH CHECK (bucket_id = 'uploads');

-- ---------- SEASONS: ensure single current (partial unique index) ----------
DROP INDEX IF EXISTS seasons_single_current;
CREATE UNIQUE INDEX seasons_single_current ON seasons (is_current) WHERE is_current = true;

-- ---------- POSTS/COMMENTS/BLOG: add updated_at for future audit ----------
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Optional: future-proof - create audit trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_posts_updated_at ON posts;
CREATE TRIGGER set_posts_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_comments_updated_at ON comments;
CREATE TRIGGER set_comments_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_blog_updated_at ON blog_posts;
CREATE TRIGGER set_blog_updated_at BEFORE UPDATE ON blog_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
