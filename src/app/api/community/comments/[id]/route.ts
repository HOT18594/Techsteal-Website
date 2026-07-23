import { NextRequest, NextResponse } from "next/server";
import { requireAdminClient, requireSession, isNextResponse } from "@/lib/server-auth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const ctx = await requireSession(req);
  if (isNextResponse(ctx)) return ctx;
  try {
    const client = requireAdminClient();
    if (ctx.session.role !== "admin") {
      const { data, error } = await client.from("comments").select("discord_id").eq("id", id).single();
      if (error || data?.discord_id !== ctx.session.discordId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const { error } = await client.from("comments").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "delete_failed" }, { status: 500 });
  }
}
