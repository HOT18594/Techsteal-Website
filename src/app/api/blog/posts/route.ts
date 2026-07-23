import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAdminClient, isNextResponse, parseJsonBody, clampString } from "@/lib/server-auth";
import { sanitizeHtml } from "@/lib/sanitize";

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (isNextResponse(ctx)) return ctx;
  const body = await parseJsonBody<{ title?: string; body?: string; images?: string[] }>(req);
  if (isNextResponse(body)) return body;
  const title = clampString(body.title, 200).trim();
  const cleanBody = sanitizeHtml(body.body || "");
  if (!title || !cleanBody.trim()) return NextResponse.json({ error: "invalid_blog_post" }, { status: 400 });
  const images = Array.isArray(body.images) ? body.images.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 10) : [];
  try {
    const client = requireAdminClient();
    const { data, error } = await client.from("blog_posts").insert({
      title,
      body: cleanBody,
      author: clampString(ctx.session.username, 100),
      images: JSON.stringify(images),
      discord_id: ctx.session.discordId,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ post: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "create_failed" }, { status: 500 });
  }
}
