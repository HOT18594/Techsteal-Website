import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isRateLimited } from "@/lib/rate-limit";
import { listNotifications, markRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// The signed-in user's private inbox. GET lists newest-first + unread count;
// POST marks read (one id or all). Every query is scoped to the session user.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await listNotifications(user.id);
    return NextResponse.json(data);
  } catch (err) {
    console.error("api/notifications GET: failed", err);
    return NextResponse.json({ notifications: [], unread: 0 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isRateLimited(`notify:${user.id}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests — slow down." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const all = body?.all === true;
  const id = typeof body?.id === "number" && Number.isInteger(body.id) && body.id > 0 ? body.id : null;

  if (!all && id === null) {
    return NextResponse.json({ error: "Nothing to mark." }, { status: 400 });
  }

  await markRead(user.id, all ? undefined : [id!]);
  return NextResponse.json({ ok: true });
}