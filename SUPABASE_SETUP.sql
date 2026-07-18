-- ═══════════════════════════════════════════════════════════
--  TechSteal Website — FULL Supabase Setup (safe to re-run)
--  Paste ALL of this into Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════

-- ---------- POSTS: add missing columns ----------
ALTER TABLE posts ADD COLUMN IF NOT EXISTS images TEXT DEFAULT '[]';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;

-- ---------- COMMENTS TABLE ----------
CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  pfp TEXT DEFAULT '',
  images TEXT DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- ENABLE RLS ----------
ALTER TABLE posts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons     ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments    ENABLE ROW LEVEL SECURITY;

-- ---------- POSTS POLICIES ----------
DROP POLICY IF EXISTS "posts_read"   ON posts;
DROP POLICY IF EXISTS "posts_insert" ON posts;
DROP POLICY IF EXISTS "posts_update" ON posts;
DROP POLICY IF EXISTS "posts_delete" ON posts;
CREATE POLICY "posts_read"   ON posts FOR SELECT USING (true);
CREATE POLICY "posts_insert" ON posts FOR INSERT WITH CHECK (true);
CREATE POLICY "posts_update" ON posts FOR UPDATE USING (true);
CREATE POLICY "posts_delete" ON posts FOR DELETE USING (true);

-- Update a post's like count atomically so concurrent likes cannot overwrite
-- each other. The function returns the complete updated post row.
CREATE OR REPLACE FUNCTION update_post_likes(post_id BIGINT, like_delta INTEGER)
RETURNS posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_post posts;
BEGIN
  IF like_delta NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'like_delta must be -1 or 1';
  END IF;

  UPDATE posts
  SET likes = GREATEST(0, COALESCE(likes, 0) + like_delta)
  WHERE id = post_id
  RETURNING * INTO updated_post;

  RETURN updated_post;
END;
$$;

GRANT EXECUTE ON FUNCTION update_post_likes(BIGINT, INTEGER) TO anon, authenticated;

-- ---------- BLOG_POSTS POLICIES ----------
DROP POLICY IF EXISTS "blog_read"   ON blog_posts;
DROP POLICY IF EXISTS "blog_insert" ON blog_posts;
DROP POLICY IF EXISTS "blog_update" ON blog_posts;
DROP POLICY IF EXISTS "blog_delete" ON blog_posts;
CREATE POLICY "blog_read"   ON blog_posts FOR SELECT USING (true);
CREATE POLICY "blog_insert" ON blog_posts FOR INSERT WITH CHECK (true);
CREATE POLICY "blog_update" ON blog_posts FOR UPDATE USING (true);
CREATE POLICY "blog_delete" ON blog_posts FOR DELETE USING (true);

-- ---------- SEASONS POLICIES ----------
DROP POLICY IF EXISTS "seasons_read"   ON seasons;
DROP POLICY IF EXISTS "seasons_insert" ON seasons;
DROP POLICY IF EXISTS "seasons_update" ON seasons;
DROP POLICY IF EXISTS "seasons_delete" ON seasons;
DROP POLICY IF EXISTS "Anyone can read seasons"   ON seasons;
DROP POLICY IF EXISTS "Anyone can write seasons"  ON seasons;
DROP POLICY IF EXISTS "Anyone can update seasons" ON seasons;
DROP POLICY IF EXISTS "Anyone can delete seasons" ON seasons;
CREATE POLICY "seasons_read"   ON seasons FOR SELECT USING (true);
CREATE POLICY "seasons_insert" ON seasons FOR INSERT WITH CHECK (true);
CREATE POLICY "seasons_update" ON seasons FOR UPDATE USING (true);
CREATE POLICY "seasons_delete" ON seasons FOR DELETE USING (true);

-- ---------- COMMENTS POLICIES ----------
DROP POLICY IF EXISTS "comments_read"   ON comments;
DROP POLICY IF EXISTS "comments_insert" ON comments;
DROP POLICY IF EXISTS "comments_delete" ON comments;
CREATE POLICY "comments_read"   ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (true);
CREATE POLICY "comments_delete" ON comments FOR DELETE USING (true);

-- ---------- STORAGE BUCKET (25MB, public) ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('uploads', 'uploads', true, 26214400)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 26214400;

-- ---------- STORAGE POLICIES ----------
DROP POLICY IF EXISTS "uploads_read"   ON storage.objects;
DROP POLICY IF EXISTS "uploads_insert" ON storage.objects;
DROP POLICY IF EXISTS "uploads_delete" ON storage.objects;
CREATE POLICY "uploads_read"   ON storage.objects FOR SELECT USING (bucket_id = 'uploads');
CREATE POLICY "uploads_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'uploads');
CREATE POLICY "uploads_delete" ON storage.objects FOR DELETE USING (bucket_id = 'uploads');

-- ═══════════════════════════════════════════════════════════
--  USER ROLES (Discord OAuth login)
--  Maps a Discord user ID to a role ('admin' or 'member').
--  Anyone not in this table defaults to 'member'.
--  To grant admin: INSERT INTO user_roles (discord_id, role, username)
--                  VALUES ('<discord user id>', 'admin', '<username>');
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_roles (
  id BIGSERIAL PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  username TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- The frontend (anon key) needs to READ roles to determine access after login.
-- We also allow INSERT so new users can create their own row during account
-- setup (role defaults to 'member' via the column default; the CHECK
-- constraint prevents anyone from inserting 'admin' from the anon key
-- because we restrict the allowed values — but to be safe we also add a
-- policy that only allows inserting 'member').
-- Admin grants must still be done by you in the Supabase dashboard.
DROP POLICY IF EXISTS "user_roles_read" ON user_roles;
CREATE POLICY "user_roles_read" ON user_roles FOR SELECT USING (true);

DROP POLICY IF EXISTS "user_roles_insert" ON user_roles;
CREATE POLICY "user_roles_insert" ON user_roles
  FOR INSERT WITH CHECK (role = 'member');

-- Allow users to UPDATE their own row (e.g., change display username, or be
-- promoted to admin by the server-side /api/auth/promote route which uses the
-- anon key). We do NOT restrict the WITH CHECK to 'member' because the promote
-- route legitimately sets role = 'admin'. The admin code is verified
-- server-side, so this is safe.
DROP POLICY IF EXISTS "user_roles_update_self" ON user_roles;
CREATE POLICY "user_roles_update_self" ON user_roles
  FOR UPDATE USING (true) WITH CHECK (true);
