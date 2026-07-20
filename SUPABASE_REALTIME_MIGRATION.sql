-- ═══════════════════════════════════════════════════════════
--  TechSteal — Enable Supabase Realtime
--  Paste ALL of this into Supabase → SQL Editor → Run (ONE TIME).
--  Turns on live updates so new/changed posts, comments, and blog
--  posts appear for everyone without a manual refresh.
--  Safe to re-run (idempotent).
-- ═══════════════════════════════════════════════════════════

-- Add the relevant tables to the realtime publication (idempotent).
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.blog_posts;

-- Replica identity FULL so UPDATE/DELETE events carry the row's old data.
-- (Harmless if already set.)
ALTER TABLE public.posts REPLICA IDENTITY FULL;
ALTER TABLE public.comments REPLICA IDENTITY FULL;
ALTER TABLE public.blog_posts REPLICA IDENTITY FULL;
