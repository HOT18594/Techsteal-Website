// Secure session handling - JWT signed with HS256 using jose.
// Replaces unsigned JSON cookie that allowed privilege escalation.
// CRITICAL: SESSION_SECRET MUST be set in production. No fallbacks to other secrets.

import { SignJWT, jwtVerify } from "jose";
import type { AuthUser } from "./auth-context";

const SESSION_COOKIE_NAME = "ts_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET environment variable is required in production. Generate with: openssl rand -base64 32"
      );
    }
    // Dev-only fallback - predictable but acceptable for local development
    console.warn(
      "[session] WARNING: SESSION_SECRET not set, using dev fallback. DO NOT USE IN PRODUCTION."
    );
    return new TextEncoder().encode("dev-secret-please-set-a-strong-secret-in-prod-32chars!!");
  }
  if (raw.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
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
