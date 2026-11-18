import { NextResponse } from "next/server";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import {
  deleteStorageObjects,
  listStorageObjects,
  referencedStoragePaths,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

function isStorageConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET() {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json({
      configured: false,
      totalObjects: 0,
      referencedCount: 0,
      orphanCount: 0,
      orphans: [],
    });
  }

  // Without a live DB connection, referencedStoragePaths() cannot see live
  // posts — fail closed rather than misreporting every bucket file as orphaned.
  if (!getDb()) {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  const [objects, refs] = await Promise.all([
    listStorageObjects(),
    referencedStoragePaths(),
  ]);

  if (objects === null || refs === null) {
    return NextResponse.json(
      { error: "Couldn't scan storage right now — try again in a moment." },
      { status: 503 }
    );
  }

  const orphans = objects.filter((path) => !refs.has(path));

  return NextResponse.json({
    configured: true,
    totalObjects: objects.length,
    referencedCount: refs.size,
    orphanCount: orphans.length,
    orphans: orphans.slice(0, 100),
  });
}

export async function POST() {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const admin = gate.account;

  if (isRateLimited(`adminstorage:${admin.id}`, 6, 60_000)) {
    return NextResponse.json(
      { error: "Slow down a little before running another storage cleanup." },
      { status: 429 }
    );
  }

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: "Supabase storage isn't configured on this deployment." },
      { status: 503 }
    );
  }

  // Fail closed when the database isn't configured — never delete bucket files
  // without verifying live DB references.
  if (!getDb()) {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  const [objects, refs] = await Promise.all([
    listStorageObjects(),
    referencedStoragePaths(),
  ]);

  if (objects === null || refs === null) {
    return NextResponse.json(
      { error: "Storage scan failed — cleanup aborted so no live images are touched." },
      { status: 503 }
    );
  }

  const orphans = objects.filter((path) => !refs.has(path));

  let deleted = 0;
  for (let i = 0; i < orphans.length; i += 200) {
    const batch = orphans.slice(i, i + 200);
    deleted += await deleteStorageObjects(batch);
  }

  await logAudit({
    actorId: admin.id,
    actorName: admin.username,
    action: "storage_cleanup",
    detail: `Removed ${deleted} orphaned storage object(s)`,
  });

  return NextResponse.json({ ok: true, deleted });
}
