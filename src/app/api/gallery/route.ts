import { NextRequest, NextResponse } from "next/server";
import { count, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { galleryComments, galleryItems } from "@/lib/schema";
import { fallbackGallery } from "@/lib/fallback-data";
import { getSessionUser } from "@/lib/auth";
import { canPostToGallery, findAccount } from "@/lib/accounts";
import { isRateLimited } from "@/lib/rate-limit";
import { GALLERY_CATEGORIES } from "@/lib/storage";
import { publicRow } from "@/lib/public-row";

export const dynamic = "force-dynamic";

const MAX_IMAGES = 8;

/** Images must live in this project's Supabase storage — gallery posts are
 * uploaded files, not arbitrary hotlinks (which could rot or smuggle
 * tracking). Forum embeds have no such rule; the gallery grid does. */
function isOurStorageUrl(url: string): boolean {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  return Boolean(base) && url.startsWith(`${base}/storage/v1/object/public/`);
}

// List all gallery items, featured first then newest, with comment counts.
export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackGallery);
  const [rows, commentCounts, viewer] = await Promise.all([
    db.select().from(galleryItems).orderBy(desc(galleryItems.featured), desc(galleryItems.id)),
    db
      .select({ itemId: galleryComments.itemId, n: count() })
      .from(galleryComments)
      .groupBy(galleryComments.itemId),
    getSessionUser(),
  ]);
  const counts = new Map(commentCounts.map((c) => [c.itemId, c.n]));
  return NextResponse.json(
    rows.map((row) => ({
      ...publicRow(row),
      // Per-viewer like state — raw liker ids stay server-side.
      liked: viewer ? ((row.likedBy ?? []) as string[]).includes(viewer.id) : false,
      commentCount: counts.get(row.id) ?? 0,
    }))
  );
}

// Post a new gallery item. Requires a signed-in account that is verified in
// the Discord server (or admin, or an explicit gallery_post permission).
//
// Body is JSON: { title, category, description?, images: string[] }. The
// images are URLs returned by /api/upload — the client uploads each file
// separately (with progress + compression), which keeps every request far
// below the serverless 4.5 MB body limit that a multi-file multipart POST
// would blow through.
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to post." }, { status: 401 });
  }

  if (isRateLimited(`gallerypost:${user.id}`, 5, 60_000)) {
    return NextResponse.json(
      { error: "You're posting too fast — wait a moment." },
      { status: 429 }
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const account = await findAccount(user.id).catch(() => null);
  if (!account || account.banned) {
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

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const category = typeof body.category === "string" ? body.category : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const images = Array.isArray(body.images)
    ? body.images.filter((u: unknown): u is string => typeof u === "string" && isOurStorageUrl(u))
    : [];

  if (!title) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  if (title.length > 60) {
    return NextResponse.json({ error: "Titles can be at most 60 characters." }, { status: 400 });
  }
  if (!GALLERY_CATEGORIES.includes(category as (typeof GALLERY_CATEGORIES)[number])) {
    return NextResponse.json({ error: "Pick a valid category." }, { status: 400 });
  }
  if (description.length > 4000) {
    return NextResponse.json({ error: "Descriptions can be at most 4,000 characters." }, { status: 400 });
  }
  if (images.length === 0) {
    return NextResponse.json({ error: "Upload at least one image." }, { status: 400 });
  }
  if (images.length > MAX_IMAGES) {
    return NextResponse.json({ error: `Posts can have at most ${MAX_IMAGES} images.` }, { status: 400 });
  }

  const [created] = await getDb()!
    .insert(galleryItems)
    .values({
      title,
      // Live account name, not the (up to 7-day-old) cookie — same rule as
      // forum threads, so renamed users post under their current name.
      builder: account?.username ?? user.username,
      authorId: user.id,
      category,
      description,
      likes: 0,
      image: images[0],
      images,
      height: "medium",
      createdAt: new Date(),
    })
    .returning();

  return NextResponse.json({ ...publicRow(created), liked: false, commentCount: 0 }, { status: 201 });
}
