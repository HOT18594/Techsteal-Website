-- ═══════════════════════════════════════════════════════════
--  TechSteal — Blog post images
--  Paste ALL of this into Supabase → SQL Editor → Run (ONE TIME).
--  Adds an `images` column (JSON array of URLs) to blog_posts so
--  blog posts can carry dynamic image uploads. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS images text;

-- (Optional) a little helper so you can inspect stored images as JSON.
-- Not required by the app; handy for debugging.
COMMENT ON COLUMN public.blog_posts.images IS 'JSON array of image URLs, e.g. ["https://.../a.png","https://.../b.png"]';
