import { NextRequest, NextResponse } from "next/server";
import { requireAdminClient, requireSession, isNextResponse } from "@/lib/server-auth";
import { sanitizeHtml } from "@/lib/sanitize";

function postId(params: { id: string }) {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

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
    if (!(await canModifyPost(client, id, ctx.session.discordId, ctx.session.role))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const update: Record<string, unknown> = {};
    if (body.body !== undefined) update.body = sanitizeHtml(String(body.body));
    if (Array.isArray(body.images)) update.images = JSON.stringify(body.images.filter((u: unknown) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 10));
    const { error } = await client.from("posts").update(update).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "update_failed" }, { status: 500 });
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
    if (!(await canModifyPost(client, id, ctx.session.discordId, ctx.session.role))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const { error } = await client.from("posts").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "delete_failed" }, { status: 500 });
  }
}
