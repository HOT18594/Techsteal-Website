import { NextRequest, NextResponse } from "next/server";
import { requireAdminClient, requireSession, isNextResponse, liveRole, serverError } from "@/lib/server-auth";
import { sanitizeHtmlAsync } from "@/lib/sanitize.server";

function postId(params: { id: string }) {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// role is the DB-validated live role (not the stale JWT role), so the admin
// short-circuit is safe against demotion.
async function canModifyPost(client: ReturnType<typeof requireAdminClient>, id: number, discordId: string, role: string) {
  if (role === "admin") return true;
  const { data, error } = await client.from("posts").select("discord_id").eq("id", id).single();
  if (error || !data) return false;
  return data.discord_id === discordId;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rawParams = await params;
  const id = postId(rawParams);
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const ctx = await requireSession(req);
  if (isNextResponse(ctx)) return ctx;
  try {
    const body = await req.json();
    const client = requireAdminClient();
    // Re-validate role from the DB — the JWT role can be stale for up to 7d
    // after a demotion. Fail closed (503) if the lookup throws, mirroring
    // requireAdmin; never fall back to the stale JWT role.
    let role: "admin" | "member";
    try {
      role = await liveRole(ctx.session.discordId);
    } catch {
      return NextResponse.json({ error: "role_check_failed" }, { status: 503 });
    }
    if (!(await canModifyPost(client, id, ctx.session.discordId, role))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const update: Record<string, unknown> = {};
    if (body.body !== undefined) update.body = await sanitizeHtmlAsync(String(body.body));
    if (Array.isArray(body.images)) update.images = JSON.stringify(body.images.filter((u: unknown) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 10));
    const { error } = await client.from("posts").update(update).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "update_failed");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rawParams = await params;
  const id = postId(rawParams);
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const ctx = await requireSession(req);
  if (isNextResponse(ctx)) return ctx;
  try {
    const client = requireAdminClient();
    let role: "admin" | "member";
    try {
      role = await liveRole(ctx.session.discordId);
    } catch {
      return NextResponse.json({ error: "role_check_failed" }, { status: 503 });
    }
    if (!(await canModifyPost(client, id, ctx.session.discordId, role))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const { error } = await client.from("posts").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "delete_failed");
  }
}
