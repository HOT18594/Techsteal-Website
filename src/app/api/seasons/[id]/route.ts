import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAdminClient, isNextResponse } from "@/lib/server-auth";
import { sanitizeSeasonHtml } from "@/lib/sanitize";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const ctx = await requireAdmin(req);
  if (isNextResponse(ctx)) return ctx;
  try {
    const body = await req.json();
    const update: Record<string, unknown> = {};
    if (body.title !== undefined) update.title = String(body.title).slice(0, 200);
    if (body.is_current !== undefined) update.is_current = Boolean(body.is_current);
    for (const key of ["prism", "sklauncher", "modrinth", "curseforge"] as const) {
      if (body[key] !== undefined) update[key] = sanitizeSeasonHtml(String(body[key]));
    }
    const client = requireAdminClient();
    if (update.is_current === true) {
      const unset = await client.from("seasons").update({ is_current: false }).neq("id", id);
      if (unset.error) throw unset.error;
    }
    const { error } = await client.from("seasons").update(update).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "update_failed" }, { status: 500 });
  }
}
