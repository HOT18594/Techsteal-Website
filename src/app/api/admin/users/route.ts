import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient, fetchUserRole } from "@/lib/supabase";
import { verifySession, getSessionCookieName } from "@/lib/session";

// Helper to verify admin session
async function verifyAdminSession(req: NextRequest) {
  const raw = req.cookies.get(getSessionCookieName())?.value;
  if (!raw) return null;
  const session = await verifySession(raw);
  if (!session) return null;

  try {
    const liveRole = await fetchUserRole(session.discordId);
    if (liveRole !== "admin") return null;
  } catch {
    return null;
  }

  return session;
}

// GET /api/admin/users - Returns list of all registered users and their roles
export async function GET(req: NextRequest) {
  const adminSession = await verifyAdminSession(req);
  if (!adminSession) {
    return NextResponse.json({ error: "Unauthorized. Admin privileges required." }, { status: 403 });
  }

  try {
    const { data, error } = await getServiceRoleClient()
      .from("user_roles")
      .select("id, discord_id, role, username, can_control_server, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch users." }, { status: 500 });
    }

    return NextResponse.json({ users: data || [] });
  } catch {
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

// PATCH /api/admin/users - Updates a specific user's role ("admin" | "member")
export async function PATCH(req: NextRequest) {
  const adminSession = await verifyAdminSession(req);
  if (!adminSession) {
    return NextResponse.json({ error: "Unauthorized. Admin privileges required." }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { discordId, role, canControlServer } = body || {};
  if (!discordId || typeof discordId !== "string") {
    return NextResponse.json({ error: "Missing or invalid discordId." }, { status: 400 });
  }

  // Build the update payload from whichever field(s) were provided.
  const update: Record<string, unknown> = {};
  if (role !== undefined) {
    if (role !== "admin" && role !== "member") {
      return NextResponse.json({ error: "Role must be 'admin' or 'member'." }, { status: 400 });
    }
    update.role = role;
  }
  if (canControlServer !== undefined) {
    update.can_control_server = Boolean(canControlServer);
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  try {
    const { data, error } = await getServiceRoleClient()
      .from("user_roles")
      .update(update)
      .eq("discord_id", discordId)
      .select("id, discord_id, role, username, can_control_server, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to update user." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, user: data });
  } catch {
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
