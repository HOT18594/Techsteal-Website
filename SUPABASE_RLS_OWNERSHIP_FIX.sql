-- ═══════════════════════════════════════════════════════════
--  TechSteal — RLS Ownership Fix
--  Adds discord_id ownership columns and restrictive RLS policies
--  Run AFTER SUPABASE_SETUP.sql and SUPABASE_LIKES_MIGRATION.sql
-- ═══════════════════════════════════════════════════════════

-- ---------- 1. ADD discord_id COLUMNS FOR OWNERSHIP ----------
-- Posts: track which Discord user created the post
ALTER TABLE posts ADD COLUMN IF NOT EXISTS discord_id TEXT;

-- Comments: track which Discord user created the comment
ALTER TABLE comments ADD COLUMN IF NOT EXISTS discord_id TEXT;

-- Blog posts: track which Discord user created the blog post
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS discord_id TEXT;

-- Seasons: no ownership concept (admin-managed), but add created_by for audit
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS created_by TEXT;

-- ---------- 2. BACKFILL EXISTING ROWS (best effort) ----------
-- For existing rows, we can't know the discord_id. Set to NULL.
-- New rows will require discord_id via RLS policy.
UPDATE posts SET discord_id = NULL WHERE discord_id IS NULL;
UPDATE comments SET discord_id = NULL WHERE discord_id IS NULL;
UPDATE blog_posts SET discord_id = NULL WHERE discord_id IS NULL;
UPDATE seasons SET created_by = NULL WHERE created_by IS NULL;

-- ---------- 3. ENABLE RLS (already enabled, but safe to repeat) ----------
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

-- ---------- 4. DROP OVER-PERMISSIVE POLICIES ----------
DROP POLICY IF EXISTS "posts_read"   ON posts;
DROP POLICY IF EXISTS "posts_insert" ON posts;
DROP POLICY IF EXISTS "posts_update" ON posts;
DROP POLICY IF EXISTS "posts_delete" ON posts;

DROP POLICY IF EXISTS "comments_read"   ON comments;
DROP POLICY IF EXISTS "comments_insert" ON comments;
DROP POLICY IF EXISTS "comments_delete" ON comments;

DROP POLICY IF EXISTS "blog_read"   ON blog_posts;
DROP POLICY IF EXISTS "blog_insert" ON blog_posts;
DROP POLICY IF EXISTS "blog_update" ON blog_posts;
DROP POLICY IF EXISTS "blog_delete" ON blog_posts;

DROP POLICY IF EXISTS "seasons_read"   ON seasons;
DROP POLICY IF EXISTS "seasons_insert" ON seasons;
DROP POLICY IF EXISTS "seasons_update" ON seasons;
DROP POLICY IF EXISTS "seasons_delete" ON seasons;

-- ---------- 5. CREATE OWNERSHIP-BASED POLICIES ----------

-- Helper: get current user's discord_id from JWT
-- Supabase sets auth.jwt() with the parsed JWT claims
-- For anon key users, this will be null unless they have a valid session

-- ----- POSTS -----
-- Anyone can read posts
CREATE POLICY "posts_read" ON posts FOR SELECT USING (true);

-- Insert: must provide your own discord_id matching JWT claim
-- Only authenticated users (with valid JWT) can insert
CREATE POLICY "posts_insert" ON posts
  FOR INSERT WITH CHECK (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'discord_id') = discord_id
  );

-- Update: only owner can update their own posts
CREATE POLICY "posts_update" ON posts
  FOR UPDATE USING (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'discord_id') = discord_id
  ) WITH CHECK (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'discord_id') = discord_id
  );

-- Delete: only owner can delete their own posts
CREATE POLICY "posts_delete" ON posts
  FOR DELETE USING (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'discord_id') = discord_id
  );

-- Admin (service_role) can do anything - handled by service_role bypass
-- Supabase service_role key bypasses RLS automatically

-- ----- COMMENTS -----
CREATE POLICY "comments_read" ON comments FOR SELECT USING (true);

CREATE POLICY "comments_insert" ON comments
  FOR INSERT WITH CHECK (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'discord_id') = discord_id
  );

-- Comments don't have UPDATE in current schema, but adding for completeness
CREATE POLICY "comments_update" ON comments
  FOR UPDATE USING (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'discord_id') = discord_id
  ) WITH CHECK (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'discord_id') = discord_id
  );

CREATE POLICY "comments_delete" ON comments
  FOR DELETE USING (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'discord_id') = discord_id
  );

-- ----- BLOG POSTS -----
CREATE POLICY "blog_read" ON blog_posts FOR SELECT USING (true);

-- Only admins should create blog posts. We enforce this in the API route,
-- but RLS policy should also reflect this.
-- For now, allow any authenticated user to insert (API will check admin role)
CREATE POLICY "blog_insert" ON blog_posts
  FOR INSERT WITH CHECK (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'discord_id') = discord_id
  );

CREATE POLICY "blog_update" ON blog_posts
  FOR UPDATE USING (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'discord_id') = discord_id
  ) WITH CHECK (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'discord_id') = discord_id
  );

CREATE POLICY "blog_delete" ON blog_posts
  FOR DELETE USING (
    auth.jwt() IS NOT NULL
    AND (auth.jwt()->>'discord_id') = discord_id
  );

-- ----- SEASONS -----
-- Seasons are admin-managed. Only service_role (admin API) should modify.
-- Public read is fine.
CREATE POLICY "seasons_read" ON seasons FOR SELECT USING (true);

-- No INSERT/UPDATE/DELETE policies for anon/authenticated roles
-- This means only service_role (which bypasses RLS) can modify seasons
-- Admin API routes use supabaseAdmin (service_role key)

-- ---------- 6. ALSO RESTRICT STORAGE UPLOADS TO posts/ FOLDER ----------
-- (Already done in SUPABASE_SECURITY_FIX.sql but repeating for completeness)
DROP POLICY IF EXISTS "uploads_insert" ON storage.objects;
CREATE POLICY "uploads_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] = 'posts'
    AND auth.jwt() IS NOT NULL
  );

DROP POLICY IF EXISTS "uploads_delete" ON storage.objects;
CREATE POLICY "uploads_delete" ON storage.objects
  FOR DELETE TO service_role USING (bucket_id = 'uploads');

-- Allow service_role full access
DROP POLICY IF EXISTS "uploads_service_all" ON storage.objects;
CREATE POLICY "uploads_service_all" ON storage.objects
  FOR ALL TO service_role USING (bucket_id = 'uploads') WITH CHECK (bucket_id = 'uploads');

-- ---------- 7. GRANT PERMISSIONS ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON posts, comments, blog_posts TO anon, authenticated;
GRANT SELECT ON seasons TO anon, authenticated;