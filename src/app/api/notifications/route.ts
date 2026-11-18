import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { accountGate, ACCOUNT_DB_ERROR_MESSAGE } from "@/lib/accounts";
import { isRateLimited } from "@/lib/rate-limit";
import { listNotifications, markRead } from "@/lib/notifications";
import { parseBodyId } from "@/lib/route-ids";

export const dynamic = "force-dynamic";

// The signed-in user's private inbox. GET lists newest-first + unread count;
// POST marks read (one id or all). Every query is scoped to the session user.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await accountGate(user.id);
  if (gate.status === "missing" || gate.status === "banned") {
    return NextResponse.json(
      { error: "Your account no longer exists on this server." },
      { status: 403 }
    );
  }
  if (gate.status === "db_error") {
    return NextResponse.json(
      { error: ACCOUNT_DB_ERROR_MESSAGE, notifications: [], unread: 0 },
      { status: 503 }
    );
  }
  if (gate.status === "unconfigured") {
    return NextResponse.json({ notifications: [], unread: 0 });
  }

  try {
    const data = await listNotifications(user.id);
    return NextResponse.json(data);
  } catch (err) {
    console.error("api/notifications GET: failed", err);
    return NextResponse.json(
      { error: ACCOUNT_DB_ERROR_MESSAGE, notifications: [], unread: 0 },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await accountGate(user.id);
  if (gate.status === "missing" || gate.status === "banned") {
    return NextResponse.json(
      { error: "Your account no longer exists on this server." },
      { status: 403 }
    );
  }
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const all = body?.all === true;
  const id = parseBodyId(body?.id);

  if (!all && id === null) {
    return NextResponse.json({ error: "Nothing to mark." }, { status: 400 });
  }

  const isAdmin = gate.status === "ok" && gate.account.role === "admin";
  if (!isAdmin && isRateLimited(`notify:${user.id}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests — slow down." }, { status: 429 });
  }

  await markRead(user.id, all ? undefined : [id!]);
  return NextResponse.json({ ok: true });
}