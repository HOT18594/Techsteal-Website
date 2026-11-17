import { NextResponse } from "next/server";
import { checkAdmin, ACCOUNT_DB_ERROR_MESSAGE } from "@/lib/accounts";
import { listAuditEntries } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Admin-only audit trail. The role check re-reads the database (checkAdmin),
// so a demoted/removed admin loses access immediately. A DB outage is a 503,
// never a 403 that tells a real admin they aren't one.
export async function GET() {
  const verdict = await checkAdmin();
  if (verdict === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (verdict === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  try {
    const entries = await listAuditEntries(150);
    return NextResponse.json({ entries });
  } catch (err) {
    console.error("api/admin/audit: query failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}