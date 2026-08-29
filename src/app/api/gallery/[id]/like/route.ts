import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { galleryItems } from "@/lib/schema";
import { getSessionUser } from "@/lib/auth";
import { ACCOUNT_DB_ERROR_MESSAGE, accountGate } from "@/lib/accounts";
import { publicRow } from "@/lib/public-row";
import { parseRouteId } from "@/lib/route-ids";

export const dynamic = "force-dynamic";

// Toggle a like on a gallery post (optimistic on the client, transactional
// here — same pattern as forum likes). Signed-in users only; each account
// can like once, sending it again un-likes.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to like." }, { status: 401 });
  }

  const { id } = await params;
  const itemId = parseRouteId(id);
  if (itemId === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Same live-account gate as every other write route: a removed (banned)
  // account's cookie may still be unexpired but must not keep liking. A DB
  // outage is a 503 — it must NOT read as "your account no longer exists".
  const gate = await accountGate(user.id);
  if (gate.status === "missing" || gate.status === "banned") {
    return NextResponse.json({ error: "Your account no longer exists on this server." }, { status: 403 });
  }
  if (gate.status === "db_error" || gate.status === "unconfigured") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  const updated = await db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(galleryItems)
      .where(eq(galleryItems.id, itemId))
      .for("update")
      .limit(1);
    if (locked.length === 0) return null;
    const currentLikedBy = (locked[0].likedBy ?? []) as string[];
    const already = currentLikedBy.includes(user.id);
    const updatedLikedBy = already
      ? currentLikedBy.filter((x) => x !== user.id)
      : [...currentLikedBy, user.id];
    const [row] = await tx
      .update(galleryItems)
      .set({ likedBy: updatedLikedBy, likes: updatedLikedBy.length })
      .where(eq(galleryItems.id, itemId))
      .returning();
    return row;
  });
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    item: publicRow(updated),
    liked: (updated.likedBy ?? []).includes(user.id),
  });
}
