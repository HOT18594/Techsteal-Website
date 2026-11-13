import { NextResponse } from "next/server";
import { getServerTelemetry } from "@/lib/server-telemetry";
import { getSessionUser } from "@/lib/auth";
import { ACCOUNT_DB_ERROR_MESSAGE, checkAdmin } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// Server console tail. Sensitive by nature: mod/plugin inventory, world
// names, stack traces, and (in join/disconnect lines) player IP:port pairs.
// Admin-only now — it used to be a public GET, handing recon-grade intel
// about the exact mod set to anyone who asked. The status page's console
// panel already degrades to "unavailable" on 401/403/503 for everyone else.
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Re-read the account from the DB (not the cookie role) so a removed or
  // banned admin loses console access immediately, same as server control.
  const verdict = await checkAdmin();
  if (verdict === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (verdict !== "yes") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await getServerTelemetry());
}
