-- ═══════════════════════════════════════════════════════════
--  TechSteal — Persistent Likes (posts + comments)
--  Paste ALL of this into Supabase → SQL Editor → Run (ONE TIME).
--  Safe to re-run: uses CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE.
-- ═══════════════════════════════════════════════════════════

-- ---------- POST LIKES (which users liked which posts) ----------
CREATE TABLE IF NOT EXISTS post_likes (
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, discord_id)
);

-- ---------- COMMENT LIKES (which users liked which comments) ----------
CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id BIGINT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (comment_id, discord_id)
);

-- ---------- RLS ----------
ALTER TABLE post_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_likes_read"    ON post_likes;
DROP POLICY IF EXISTS "post_likes_write"   ON post_likes;
DROP POLICY IF EXISTS "comment_likes_read" ON comment_likes;
DROP POLICY IF EXISTS "comment_likes_write" ON comment_likes;

CREATE POLICY "post_likes_read"    ON post_likes    FOR SELECT USING (true);
CREATE POLICY "post_likes_write"   ON post_likes
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "comment_likes_read" ON comment_likes FOR SELECT USING (true);
CREATE POLICY "comment_likes_write" ON comment_likes
  FOR ALL USING (true) WITH CHECK (true);

-- ---------- Keep the posts.likes counter in sync ----------
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
CREATE TRIGGER trg_post_likes_count
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION sync_post_likes_count();

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
CREATE TRIGGER trg_comment_likes_count
  AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW EXECUTE FUNCTION sync_comment_likes_count();

-- ---------- Toggle a post like (idempotent; prevents double-like) ----------
-- Returns the NEW count + whether the caller now likes it. Recomputes the
-- count from post_likes so a refresh can never re-increment.
CREATE OR REPLACE FUNCTION toggle_post_like(p_post_id BIGINT, p_discord_id TEXT)
RETURNS TABLE (likes INT, liked BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM post_likes WHERE post_id = p_post_id AND discord_id = p_discord_id) THEN
    DELETE FROM post_likes WHERE post_id = p_post_id AND discord_id = p_discord_id;
    RETURN QUERY SELECT (SELECT COUNT(*)::INT FROM post_likes WHERE post_id = p_post_id) AS likes, FALSE AS liked;
  ELSE
    INSERT INTO post_likes (post_id, discord_id) VALUES (p_post_id, p_discord_id)
      ON CONFLICT DO NOTHING;
    RETURN QUERY SELECT (SELECT COUNT(*)::INT FROM post_likes WHERE post_id = p_post_id) AS likes, TRUE AS liked;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_post_like(BIGINT, TEXT) TO anon, authenticated;

-- ---------- Toggle a comment like ----------
CREATE OR REPLACE FUNCTION toggle_comment_like(p_comment_id BIGINT, p_discord_id TEXT)
RETURNS TABLE (likes INT, liked BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM comment_likes WHERE comment_id = p_comment_id AND discord_id = p_discord_id) THEN
    DELETE FROM comment_likes WHERE comment_id = p_comment_id AND discord_id = p_discord_id;
    RETURN QUERY SELECT (SELECT COUNT(*)::INT FROM comment_likes WHERE comment_id = p_comment_id) AS likes, FALSE AS liked;
  ELSE
    INSERT INTO comment_likes (comment_id, discord_id) VALUES (p_comment_id, p_discord_id)
      ON CONFLICT DO NOTHING;
    RETURN QUERY SELECT (SELECT COUNT(*)::INT FROM comment_likes WHERE comment_id = p_comment_id) AS likes, TRUE AS liked;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_comment_like(BIGINT, TEXT) TO anon, authenticated;

-- ---------- Fetch which posts/comments the current user has liked ----------
-- Used on page load so likes survive a refresh (and are consistent across devices).
CREATE OR REPLACE FUNCTION my_liked_post_ids(p_discord_id TEXT)
RETURNS TABLE (post_id BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT post_id FROM post_likes WHERE discord_id = p_discord_id;
$$;

GRANT EXECUTE ON FUNCTION my_liked_post_ids(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION my_liked_comment_ids(p_discord_id TEXT)
RETURNS TABLE (comment_id BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT comment_id FROM comment_likes WHERE discord_id = p_discord_id;
$$;

GRANT EXECUTE ON FUNCTION my_liked_comment_ids(TEXT) TO anon, authenticated;

-- ---------- Backfill: seed the counts from any pre-existing data ----------
-- (comments.likes column is added below in case it does not exist yet)
ALTER TABLE comments ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
UPDATE posts    SET likes = (SELECT COUNT(*) FROM post_likes    WHERE post_id = posts.id);
UPDATE comments SET likes = (SELECT COUNT(*) FROM comment_likes WHERE comment_id = comments.id);
