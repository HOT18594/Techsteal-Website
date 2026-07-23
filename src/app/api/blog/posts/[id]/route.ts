import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAdminClient, isNextResponse } from "@/lib/server-auth";
import { sanitizeHtml } from "@/lib/sanitize";

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const ctx = await requireAdmin(req);
  if (isNextResponse(ctx)) return ctx;
  try {
    const body = await req.json();
    const update: Record<string, unknown> = {};
    if (body.title !== undefined) update.title = String(body.title).slice(0, 200).trim();
    if (body.body !== undefined) update.body = sanitizeHtml(String(body.body));
    if (Array.isArray(body.images)) update.images = JSON.stringify(body.images.filter((u: unknown) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 10));
    const { error } = await requireAdminClient().from("blog_posts").update(update).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "update_failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const ctx = await requireAdmin(req);
  if (isNextResponse(ctx)) return ctx;
  try {
    const { error } = await requireAdminClient().from("blog_posts").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "delete_failed" }, { status: 500 });
  }
}
