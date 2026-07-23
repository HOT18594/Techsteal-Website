import { NextRequest, NextResponse } from "next/server";
import { requireAdminClient, requireSession, isNextResponse, parseJsonBody } from "@/lib/server-auth";

type LikeBody = { kind?: "post" | "comment"; id?: number };

export async function GET(req: NextRequest) {
  const ctx = await requireSession(req);
  if (isNextResponse(ctx)) return ctx;
  try {
    const client = requireAdminClient();
    const [posts, comments] = await Promise.all([
      client.from("post_likes").select("post_id").eq("discord_id", ctx.session.discordId),
      client.from("comment_likes").select("comment_id").eq("discord_id", ctx.session.discordId),
    ]);
    if (posts.error) throw posts.error;
    if (comments.error) throw comments.error;
    return NextResponse.json({
      posts: (posts.data || []).map((r) => r.post_id),
      comments: (comments.data || []).map((r) => r.comment_id),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "likes_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireSession(req);
  if (isNextResponse(ctx)) return ctx;
  const body = await parseJsonBody<LikeBody>(req);
  if (isNextResponse(body)) return body;
  const id = Number(body.id);
  if ((body.kind !== "post" && body.kind !== "comment") || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_like_target" }, { status: 400 });
  }
  try {
    const client = requireAdminClient();
    if (body.kind === "post") {
      const existing = await client.from("post_likes").select("post_id").eq("post_id", id).eq("discord_id", ctx.session.discordId).maybeSingle();
      if (existing.error) throw existing.error;
      let liked = false;
      if (existing.data) {
        const del = await client.from("post_likes").delete().eq("post_id", id).eq("discord_id", ctx.session.discordId);
        if (del.error) throw del.error;
      } else {
        const ins = await client.from("post_likes").insert({ post_id: id, discord_id: ctx.session.discordId });
        if (ins.error) throw ins.error;
        liked = true;
      }
      const count = await client.from("post_likes").select("post_id", { count: "exact", head: true }).eq("post_id", id);
      if (count.error) throw count.error;
      return NextResponse.json({ likes: count.count || 0, liked });
    }

    const existing = await client.from("comment_likes").select("comment_id").eq("comment_id", id).eq("discord_id", ctx.session.discordId).maybeSingle();
    if (existing.error) throw existing.error;
    let liked = false;
    if (existing.data) {
      const del = await client.from("comment_likes").delete().eq("comment_id", id).eq("discord_id", ctx.session.discordId);
      if (del.error) throw del.error;
    } else {
      const ins = await client.from("comment_likes").insert({ comment_id: id, discord_id: ctx.session.discordId });
      if (ins.error) throw ins.error;
      liked = true;
    }
    const count = await client.from("comment_likes").select("comment_id", { count: "exact", head: true }).eq("comment_id", id);
    if (count.error) throw count.error;
    return NextResponse.json({ likes: count.count || 0, liked });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "like_failed" }, { status: 500 });
  }
}
