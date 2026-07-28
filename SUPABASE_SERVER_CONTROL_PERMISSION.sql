-- ═══════════════════════════════════════════════════════════
--  TechSteal — Per-user server control permission
--  Paste into Supabase → SQL Editor → Run (ONE TIME). Safe to re-run.
--
--  Adds a `can_control_server` flag to user_roles so admins can
--  allow/disallow individual members from starting/stopping the
--  Minecraft server via the admin panel. Defaults to TRUE for
--  existing members so current behavior is preserved; admins can
--  then disallow specific members.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS can_control_server BOOLEAN NOT NULL DEFAULT TRUE;

-- Preserve existing behavior: every current member can control the server
-- until an admin explicitly disallows them.
UPDATE public.user_roles
  SET can_control_server = TRUE
  WHERE can_control_server IS NULL OR can_control_server = FALSE;

COMMENT ON COLUMN public.user_roles.can_control_server IS
  'Whether this user may start/stop the Minecraft server. Admins are always allowed regardless of this flag.';
