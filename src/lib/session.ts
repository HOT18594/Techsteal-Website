// Secure session handling - JWT signed with HS256 using jose.
// Replaces unsigned JSON cookie that allowed privilege escalation.

import { SignJWT, jwtVerify } from "jose";
import type { AuthUser } from "./auth-context";

const SESSION_COOKIE_NAME = "ts_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const raw =
    process.env.SESSION_SECRET ||
    process.env.ADMIN_UNLOCK_CODE ||
    process.env.DISCORD_CLIENT_SECRET ||
    "dev-secret-please-set-a-strong-secret-in-prod-32chars";
  return new TextEncoder().encode(raw);
}

export async function signSession(payload: AuthUser): Promise<string> {
  const secret = getSecret();
  const jwt = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret);
  return jwt;
}

export async function verifySession(token: string): Promise<AuthUser | null> {
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret);
    // Validate required fields
    if (
      !payload.discordId ||
      !payload.username ||
      !payload.role ||
      (payload.role !== "admin" && payload.role !== "member")
    ) {
      return null;
    }
    return {
      discordId: String(payload.discordId),
      username: String(payload.username),
      avatar: String(payload.avatar || ""),
      role: payload.role as "admin" | "member",
      isNewUser: Boolean(payload.isNewUser),
      inGuild: Boolean(payload.inGuild),
    };
  } catch {
    return null;
  }
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getSessionMaxAge() {
  return SESSION_MAX_AGE;
}

// Helper to build cookie options
export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: SESSION_MAX_AGE,
    path: "/",
  };
}
