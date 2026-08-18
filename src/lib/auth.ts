import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { SessionUser } from "@/types";

const COOKIE_NAME = "techsteal_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

/** Secret for signing session JWTs. Falls back to a dev secret locally. */
function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET ?? "dev-session-secret-change-me";
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
    const { payload } = await jwtVerify(token, getSecret());
    return (payload.user as SessionUser) ?? null;
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
