import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { SessionUser } from "@/types";

const COOKIE_NAME = "techsteal_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Known-placeholder values that must never sign production sessions — a
// secret copied verbatim from .env.example is publicly known and therefore
// forgeable, exactly like no secret at all.
const PLACEHOLDER_SECRETS = new Set([
  "dev-session-secret-change-me",
  "change-me-to-a-random-string",
]);

/** Secret for signing session JWTs. */
function getSecret(): Uint8Array {
  let secret = process.env.SESSION_SECRET;
  if (!secret || PLACEHOLDER_SECRETS.has(secret) || secret.length < 16) {
    if (process.env.NODE_ENV === "production") {
      // Never fall back to a public default in production — anyone could
      // forge a session. Fail closed: sessions just don't work until a real
      // SESSION_SECRET is set, rather than quietly becoming forgeable.
      throw new Error(
        "SESSION_SECRET is missing, a known placeholder, or too short. Set a strong random value."
      );
    }
    // Local dev only: a fixed secret is fine (no real users).
    secret = "dev-session-secret-change-me";
  }
  return new TextEncoder().encode(secret);
}

/** Sign a JWT carrying the session user. */
export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

/** Verify a session JWT and return the user, or null if invalid/expired. */
export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    // Pin the algorithm — without this jose also accepts HS384/HS512.
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const user = payload.user as Partial<SessionUser> | undefined;
    // Runtime-validate the shape: don't trust whatever the token carries.
    if (!user || typeof user.id !== "string" || typeof user.username !== "string") {
      return null;
    }
    return {
      id: user.id,
      username: user.username,
      role: user.role === "admin" ? "admin" : "member",
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : undefined,
      onboarded: user.onboarded,
      discordVerified: user.discordVerified,
    };
  } catch {
    return null;
  }
}

/** Read the session cookie and return the logged-in user (or null). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Set the session cookie for a user. */
export async function setSession(user: SessionUser): Promise<void> {
  const token = await signSession(user);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Clear the session cookie. */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
