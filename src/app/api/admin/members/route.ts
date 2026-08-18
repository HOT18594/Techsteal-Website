import { NextResponse } from "next/server";
import { getAllAccounts, updateAccount, removeAccount, addAccount } from "@/lib/accounts";
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
  return NextResponse.json({ accounts: getAllAccounts() });
}

// Create or update an account.
// Body: { id?, username?, email?, role?, permissions?, create? }
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));

  // Create a new account.
  if (body?.create) {
    const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : "";
    const username =
      typeof body.username === "string" && body.username.trim()
        ? body.username.trim()
        : "";
    if (!id || !username) {
      return NextResponse.json({ error: "id and username are required" }, { status: 400 });
    }
    const role = body.role === "admin" ? "admin" : "member";
    const permissions = sanitizePermissions(body.permissions);
    const account = addAccount({
      id,
      username,
      email: typeof body.email === "string" ? body.email : undefined,
      role,
      permissions,
    });
    return NextResponse.json({ account }, { status: 201 });
  }

  // Update an existing account.
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: Parameters<typeof updateAccount>[1] = {};
  if (typeof body.username === "string") patch.username = body.username.trim();
  if (typeof body.email === "string") patch.email = body.email.trim();
  if (body.role === "admin" || body.role === "member") patch.role = body.role;
  if (Array.isArray(body.permissions)) patch.permissions = sanitizePermissions(body.permissions);

  const updated = updateAccount(id, patch);
  if (!updated) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ account: updated });
}

// Remove an account.
export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (id === "admin") {
    return NextResponse.json({ error: "Cannot remove the primary admin" }, { status: 400 });
  }

  const removed = removeAccount(id);
  if (!removed) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

function sanitizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is Permission =>
    VALID_PERMISSIONS.includes(p as Permission)
  );
}
