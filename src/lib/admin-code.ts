// The admin unlock code used during onboarding / profile settings.
//
// IMPORTANT: this used to be a hardcoded constant, but the repo is public —
// anyone who could read the source could claim admin. The code now comes
// from the ADMIN_CODE environment variable (set it in .env.local and in
// Vercel). We also accept ADMIN_UNLOCK_CODE (the name this project's Vercel
// environment was originally created with) as a fallback so an existing
// production env keeps working without a redeploy of secrets. In
// development we fall back to the legacy constant only so the onboarding
// flow still works locally; in production a missing code disables
// unlocking entirely rather than trusting a leaked constant.

const LEGACY_DEV_CODE = "TS-ADMIN-2026";

export function getAdminCode(): string | null {
  const fromEnv = process.env.ADMIN_CODE ?? process.env.ADMIN_UNLOCK_CODE;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") return null;
  return LEGACY_DEV_CODE;
}
