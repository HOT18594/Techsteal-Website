import { NextRequest, NextResponse } from "next/server";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import { listAuditEntries } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Admin-only audit trail. Supports ?limit=1..500 (default 200).
export async function GET(request: NextRequest) {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const rawLimit = request.nextUrl.searchParams.get("limit");
  const parsed = rawLimit !== null && rawLimit.trim() !== "" ? Number.parseInt(rawLimit, 10) : Number.NaN;
  const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(500, parsed)) : 200;

  try {
    const entries = await listAuditEntries(limit);
    return NextResponse.json({ entries });
  } catch (err) {
    console.error("api/admin/audit: query failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}
