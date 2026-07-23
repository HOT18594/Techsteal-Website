import { NextRequest, NextResponse } from "next/server";
import { requireAdminClient, requireSession, isNextResponse, parseJsonBody, clampString } from "@/lib/server-auth";
import { sanitizeHtml } from "@/lib/sanitize";

export async function POST(req: NextRequest) {
  const ctx = await requireSession(req);
  if (isNextResponse(ctx)) return ctx;
  const body = await parseJsonBody<{ body?: string; images?: string[] }>(req);
  if (isNextResponse(body)) return body;

  const images = Array.isArray(body.images) ? body.images.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 10) : [];
  const cleanBody = sanitizeHtml(body.body || "");
  if (!cleanBody.trim() && images.length === 0) {
    return NextResponse.json({ error: "empty_post" }, { status: 400 });
  }

  try {
    const client = requireAdminClient();
    const { data, error } = await client
      .from("posts")
      .insert({
        author: clampString(ctx.session.username, 100),
        body: cleanBody,
        pfp: ctx.session.avatar || "",
        images: JSON.stringify(images),
        likes: 0,
        discord_id: ctx.session.discordId,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ post: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "create_failed" }, { status: 500 });
  }
}
