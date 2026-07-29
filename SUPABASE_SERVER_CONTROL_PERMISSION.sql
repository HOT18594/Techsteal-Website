-- ═══════════════════════════════════════════════════════════
--  TechSteal — Per-user server control permission
--  Paste into Supabase → SQL Editor → Run (ONE TIME). Safe to re-run.
--
--  Adds a `can_control_server` flag to user_roles. Members are BLOCKED by
--  default — an admin must explicitly allow each member in the admin panel
--  before they can start/stop the Minecraft server. Admins are always
--  allowed regardless of this flag (enforced in the control route).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS can_control_server BOOLEAN NOT NULL DEFAULT FALSE;

-- Default is BLOCKED for everyone (including existing members). Admins are
-- unaffected (the control route allows admins regardless of this flag), so
-- re-running this safely re-blocks members an admin has not explicitly allowed.
ALTER TABLE public.user_roles
  ALTER COLUMN can_control_server SET DEFAULT FALSE;

UPDATE public.user_roles
  SET can_control_server = FALSE
  WHERE role = 'member';

COMMENT ON COLUMN public.user_roles.can_control_server IS
  'Whether this user may start/stop the Minecraft server. Defaults to FALSE (blocked); admins are always allowed regardless of this flag.';
