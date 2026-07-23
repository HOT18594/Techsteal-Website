import { NextRequest, NextResponse } from "next/server";
import { requireAdminClient, requireSession, isNextResponse, parseJsonBody, clampString } from "@/lib/server-auth";
import { sanitizeHtml } from "@/lib/sanitize";

export async function POST(req: NextRequest) {
  const ctx = await requireSession(req);
  if (isNextResponse(ctx)) return ctx;
  const body = await parseJsonBody<{ post_id?: number; body?: string; images?: string[] }>(req);
  if (isNextResponse(body)) return body;
  const postId = Number(body.post_id);
  if (!Number.isInteger(postId) || postId <= 0) return NextResponse.json({ error: "invalid_post" }, { status: 400 });
  const images = Array.isArray(body.images) ? body.images.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 10) : [];
  const cleanBody = sanitizeHtml(body.body || "");
  if (!cleanBody.trim() && images.length === 0) return NextResponse.json({ error: "empty_comment" }, { status: 400 });
  try {
    const client = requireAdminClient();
    const { data, error } = await client.from("comments").insert({
      post_id: postId,
      author: clampString(ctx.session.username, 100),
      body: cleanBody,
      pfp: ctx.session.avatar || "",
      images: JSON.stringify(images),
      discord_id: ctx.session.discordId,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ comment: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "create_failed" }, { status: 500 });
  }
}
