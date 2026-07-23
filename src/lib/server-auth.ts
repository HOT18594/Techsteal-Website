import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName, verifySession } from "@/lib/session";
import { supabaseAdmin, fetchUserRole } from "@/lib/supabase";
import type { AuthUser } from "@/lib/auth-context";

export type ApiContext = {
  session: AuthUser;
};

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function requireSession(req: NextRequest): Promise<ApiContext | NextResponse> {
  const raw = req.cookies.get(getSessionCookieName())?.value;
  if (!raw) return jsonError("not_authenticated", 401);
  const session = await verifySession(raw);
  if (!session) return jsonError("invalid_session", 401);
  if (session.isNewUser) return jsonError("account_setup_required", 403);
  return { session };
}

export async function requireAdmin(req: NextRequest): Promise<ApiContext | NextResponse> {
  const ctx = await requireSession(req);
  if (ctx instanceof NextResponse) return ctx;
  let liveRole: "admin" | "member";
  try {
    liveRole = await fetchUserRole(ctx.session.discordId);
  } catch {
    return jsonError("admin_role_check_failed", 503);
  }
  if (liveRole !== "admin") return jsonError("admin_required", 403);
  ctx.session.role = liveRole;
  return ctx;
}

export function requireAdminClient() {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for server-side mutations");
  }
  return supabaseAdmin;
}

export async function parseJsonBody<T>(req: NextRequest): Promise<T | NextResponse> {
  try {
    return (await req.json()) as T;
  } catch {
    return jsonError("invalid_body", 400);
  }
}

export function isNextResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export function clampString(value: unknown, max: number): string {
  return String(value ?? "").slice(0, max);
}
