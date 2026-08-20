import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { galleryItems } from "@/lib/schema";
import { fallbackGallery } from "@/lib/fallback-data";
import { getSessionUser } from "@/lib/auth";
import { canPostToGallery, findAccount } from "@/lib/accounts";
import { ALLOWED_MIME, GALLERY_CATEGORIES, MAX_BYTES, uploadImage } from "@/lib/storage";

export const dynamic = "force-dynamic";

// List all gallery items.
export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackGallery);
  const rows = await db.select().from(galleryItems);
  return NextResponse.json(rows);
}

// Post a new gallery item. Requires a signed-in account that is verified in
// the Discord server (or admin, or an explicit gallery_post permission).
// Body is multipart/form-data: { title, category, image <File> }.
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to post." }, { status: 401 });
  }

  if (getDb()) {
    const account = await findAccount(user.id).catch(() => null);
    if (!account) {
      return NextResponse.json(
        { error: "Your account no longer exists on this server." },
        { status: 403 }
      );
    }
    if (!canPostToGallery(account)) {
      return NextResponse.json(
        { error: "Only verified Discord members can post to the gallery." },
        { status: 403 }
      );
    }
  } else {
    // Without a DB nothing persists — reject before attempting an upload so we
    // don't orphan a file in storage.
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const title = typeof form.get("title") === "string" ? (form.get("title") as string).trim() : "";
  const category =
    typeof form.get("category") === "string" ? (form.get("category") as string) : "";
  const file = form.get("image");

  if (!title) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  if (title.length > 60) {
    return NextResponse.json({ error: "Titles can be at most 60 characters." }, { status: 400 });
  }
  if (!GALLERY_CATEGORIES.includes(category as (typeof GALLERY_CATEGORIES)[number])) {
    return NextResponse.json(
      { error: "Pick a valid category." },
      { status: 400 }
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "An image is required." }, { status: 400 });
  }
  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    return NextResponse.json(
      { error: "Images must be JPG, PNG, WebP or GIF." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Images must be under 8 MB." }, { status: 400 });
  }

  // Upload to Supabase Storage, then persist.
  let imageUrl: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    imageUrl = await uploadImage(buffer, file.type, file.name);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    return NextResponse.json(
      { error: configured ? message : "Gallery storage isn't configured yet." },
      { status: 503 }
    );
  }

  const createdAt = new Date().toISOString();
  const [created] = await getDb()!
    .insert(galleryItems)
    .values({
      title,
      builder: user.username,
      category,
      likes: 0,
      image: imageUrl,
      height: "medium",
    })
    .returning();

  return NextResponse.json({ ...created, createdAt }, { status: 201 });
}