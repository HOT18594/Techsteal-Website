import { NextRequest, NextResponse } from "next/server";
import { requireAdminClient, requireSession, isNextResponse, liveRole, serverError } from "@/lib/server-auth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const ctx = await requireSession(req);
  if (isNextResponse(ctx)) return ctx;
  try {
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
    if (role !== "admin") {
      const { data, error } = await client.from("comments").select("discord_id").eq("id", id).single();
      if (error || data?.discord_id !== ctx.session.discordId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const { error } = await client.from("comments").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e, "delete_failed");
  }
}
