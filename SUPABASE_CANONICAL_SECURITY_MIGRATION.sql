-- ═══════════════════════════════════════════════════════════
--  TechSteal v1.2.0 — Canonical Server-Authoritative Security Migration
--  Run this once in Supabase SQL Editor after deploying the matching app code.
--
--  Security model:
--  - Browser anon key can read public content only.
--  - All mutations go through Next.js API routes that verify ts_session.
--  - API routes use SUPABASE_SERVICE_ROLE_KEY server-side.
--  - Client-supplied Discord IDs are not trusted by database RPCs.
-- ═══════════════════════════════════════════════════════════

-- ---------- Required ownership/audit columns ----------
ALTER TABLE posts      ADD COLUMN IF NOT EXISTS discord_id TEXT;
ALTER TABLE comments   ADD COLUMN IF NOT EXISTS discord_id TEXT;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS discord_id TEXT;
ALTER TABLE seasons    ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE posts      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE comments   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE comments ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
ALTER TABLE posts    ADD COLUMN IF NOT EXISTS images TEXT DEFAULT '[]';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS images TEXT DEFAULT '[]';
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS images TEXT DEFAULT '[]';

-- ---------- Likes tables ----------
CREATE TABLE IF NOT EXISTS post_likes (
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, discord_id)
);

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id BIGINT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (comment_id, discord_id)
);

-- ---------- updated_at trigger ----------
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

-- ---------- likes count sync ----------
CREATE OR REPLACE FUNCTION sync_post_likes_count() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE posts SET likes = (SELECT COUNT(*) FROM post_likes WHERE post_id = NEW.post_id) WHERE id = NEW.post_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE posts SET likes = (SELECT COUNT(*) FROM post_likes WHERE post_id = OLD.post_id) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_post_likes_count ON post_likes;
CREATE TRIGGER trg_post_likes_count AFTER INSERT OR DELETE ON post_likes FOR EACH ROW EXECUTE FUNCTION sync_post_likes_count();

CREATE OR REPLACE FUNCTION sync_comment_likes_count() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE comments SET likes = (SELECT COUNT(*) FROM comment_likes WHERE comment_id = NEW.comment_id) WHERE id = NEW.comment_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE comments SET likes = (SELECT COUNT(*) FROM comment_likes WHERE comment_id = OLD.comment_id) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_comment_likes_count ON comment_likes;
CREATE TRIGGER trg_comment_likes_count AFTER INSERT OR DELETE ON comment_likes FOR EACH ROW EXECUTE FUNCTION sync_comment_likes_count();

-- Remove old public SECURITY DEFINER RPCs that trusted caller-supplied discord_id.
DROP FUNCTION IF EXISTS toggle_post_like(BIGINT, TEXT);
DROP FUNCTION IF EXISTS toggle_comment_like(BIGINT, TEXT);
DROP FUNCTION IF EXISTS my_liked_post_ids(TEXT);
DROP FUNCTION IF EXISTS my_liked_comment_ids(TEXT);
DROP FUNCTION IF EXISTS update_post_likes(BIGINT, INTEGER);

-- ---------- RLS ----------
ALTER TABLE posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

-- Drop legacy/permissive policies.
DROP POLICY IF EXISTS "posts_read" ON posts;
DROP POLICY IF EXISTS "posts_insert" ON posts;
DROP POLICY IF EXISTS "posts_update" ON posts;
DROP POLICY IF EXISTS "posts_delete" ON posts;
DROP POLICY IF EXISTS "comments_read" ON comments;
DROP POLICY IF EXISTS "comments_insert" ON comments;
DROP POLICY IF EXISTS "comments_update" ON comments;
DROP POLICY IF EXISTS "comments_delete" ON comments;
DROP POLICY IF EXISTS "blog_read" ON blog_posts;
DROP POLICY IF EXISTS "blog_insert" ON blog_posts;
DROP POLICY IF EXISTS "blog_update" ON blog_posts;
DROP POLICY IF EXISTS "blog_delete" ON blog_posts;
DROP POLICY IF EXISTS "seasons_read" ON seasons;
DROP POLICY IF EXISTS "seasons_insert" ON seasons;
DROP POLICY IF EXISTS "seasons_update" ON seasons;
DROP POLICY IF EXISTS "seasons_delete" ON seasons;
DROP POLICY IF EXISTS "user_roles_read" ON user_roles;
DROP POLICY IF EXISTS "user_roles_insert" ON user_roles;
DROP POLICY IF EXISTS "user_roles_update_self" ON user_roles;
DROP POLICY IF EXISTS "user_roles_service_all" ON user_roles;
DROP POLICY IF EXISTS "post_likes_read" ON post_likes;
DROP POLICY IF EXISTS "post_likes_write" ON post_likes;
DROP POLICY IF EXISTS "comment_likes_read" ON comment_likes;
DROP POLICY IF EXISTS "comment_likes_write" ON comment_likes;

-- Public reads. Writes are intentionally absent for anon/authenticated.
CREATE POLICY "posts_read" ON posts FOR SELECT USING (true);
CREATE POLICY "comments_read" ON comments FOR SELECT USING (true);
CREATE POLICY "blog_read" ON blog_posts FOR SELECT USING (true);
CREATE POLICY "seasons_read" ON seasons FOR SELECT USING (true);

-- Service role policies for explicitness; service_role also bypasses RLS.
CREATE POLICY "posts_service_all" ON posts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "comments_service_all" ON comments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "blog_service_all" ON blog_posts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "seasons_service_all" ON seasons FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "user_roles_service_all" ON user_roles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "post_likes_service_all" ON post_likes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "comment_likes_service_all" ON comment_likes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- Storage ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('uploads', 'uploads', true, 5242880)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880;

DROP POLICY IF EXISTS "uploads_read" ON storage.objects;
DROP POLICY IF EXISTS "uploads_insert" ON storage.objects;
DROP POLICY IF EXISTS "uploads_delete" ON storage.objects;
DROP POLICY IF EXISTS "uploads_service_all" ON storage.objects;
CREATE POLICY "uploads_read" ON storage.objects FOR SELECT USING (bucket_id = 'uploads');
CREATE POLICY "uploads_service_all" ON storage.objects FOR ALL TO service_role USING (bucket_id = 'uploads') WITH CHECK (bucket_id = 'uploads');

-- ---------- Consistency constraints/indexes ----------
DROP INDEX IF EXISTS seasons_single_current;
CREATE UNIQUE INDEX seasons_single_current ON seasons (is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS posts_discord_id_idx ON posts(discord_id);
CREATE INDEX IF NOT EXISTS comments_post_id_idx ON comments(post_id);
CREATE INDEX IF NOT EXISTS comments_discord_id_idx ON comments(discord_id);
CREATE INDEX IF NOT EXISTS blog_posts_discord_id_idx ON blog_posts(discord_id);

-- Backfill like counters from junction tables.
UPDATE posts SET likes = (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id);
UPDATE comments SET likes = (SELECT COUNT(*) FROM comment_likes WHERE comment_id = comments.id);
