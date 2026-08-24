import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { accountGate, ACCOUNT_DB_ERROR_MESSAGE } from "@/lib/accounts";
import { isRateLimited } from "@/lib/rate-limit";
import { ALLOWED_MIME, MAX_BYTES, sniffImageMime, uploadImage } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Image embeds for the forum editor. The editor uploads the file here and
// inserts the returned URL as markdown. Everything about the file is
// validated server-side (size, magic bytes) exactly like gallery posts.

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to upload." }, { status: 401 });
  }
  // Live-account gate: removed account → 403, DB outage → 503.
  const gate = await accountGate(user.id);
  if (gate.status === "missing" || gate.status === "banned") {
    return NextResponse.json({ error: "Your account no longer exists on this server." }, { status: 403 });
  }
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "unconfigured") {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  // Spam guard for members — admins are exempt from rate limits.
  if (gate.account.role !== "admin" && isRateLimited(`upload:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "Slow down — too many uploads." }, { status: 429 });
  }

  // Reject oversized bodies BEFORE formData() buffers the whole multipart
  // into memory. (Vercel caps request bodies anyway, but self-hosted
  // deployments don't — parse-then-check would let a huge upload pin RAM.)
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "An image is required." }, { status: 400 });
  }
  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    return NextResponse.json({ error: "Images must be JPG, PNG, WebP or GIF." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffImageMime(buffer);
    if (!sniffed) {
      return NextResponse.json(
        { error: "That file doesn't look like a real JPG, PNG, WebP or GIF image." },
        { status: 400 }
      );
    }
    const url = await uploadImage(buffer, sniffed, file.name, "embeds");
    return NextResponse.json({ url }, { status: 201 });
  } catch (err) {
    console.error("upload: embed failed", err);
    const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    return NextResponse.json(
      { error: configured ? "Upload failed — try again in a moment." : "Image storage isn't configured yet." },
      { status: 503 }
    );
  }
}
