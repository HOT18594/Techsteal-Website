import { NextRequest, NextResponse } from "next/server";
import { requireAdminClient, requireSession, isNextResponse } from "@/lib/server-auth";
import { MAX_IMAGE_SIZE } from "@/lib/api";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);

export async function POST(req: NextRequest) {
  const ctx = await requireSession(req);
  if (isNextResponse(ctx)) return ctx;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "missing_file" }, { status: 400 });
    if (file.size > MAX_IMAGE_SIZE) return NextResponse.json({ error: "file_too_large" }, { status: 400 });
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) return NextResponse.json({ error: "invalid_file_type" }, { status: 400 });
    const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    const fileName = `posts/${ctx.session.discordId}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
    const client = requireAdminClient();
    const { data, error } = await client.storage.from("uploads").upload(fileName, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data: urlData } = client.storage.from("uploads").getPublicUrl(data.path);
    return NextResponse.json({ url: urlData.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "upload_failed" }, { status: 500 });
  }
}
