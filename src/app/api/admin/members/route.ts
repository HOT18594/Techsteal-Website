import { NextResponse } from "next/server";
import { getAllAccounts, updateAccount, removeAccount } from "@/lib/accounts";
import { getSessionUser } from "@/lib/auth";
import type { Permission } from "@/types";

export const dynamic = "force-dynamic";

const VALID_PERMISSIONS: Permission[] = ["server_control", "ai_access"];

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

// List all accounts (admin only).
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ accounts: await getAllAccounts() });
}

// Update an account's role/permissions (admin only).
// Body: { id, role?, permissions? }
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: Parameters<typeof updateAccount>[1] = {};
  if (body.role === "admin" || body.role === "member") patch.role = body.role;
  if (Array.isArray(body.permissions)) patch.permissions = sanitizePermissions(body.permissions);

  const updated = await updateAccount(id, patch);
  if (!updated) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ account: updated });
}

// Remove an account (admin only).
export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const removed = await removeAccount(id);
  if (!removed) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

function sanitizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is Permission =>
    VALID_PERMISSIONS.includes(p as Permission)
  );
}
