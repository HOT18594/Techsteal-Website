import { desc } from "drizzle-orm";
import { getDb } from "./db";
import { auditLog } from "./schema";
import type { AuditEntry } from "@/types";

// Admin audit trail. Every privileged action (role/permission changes,
// bans/restores, admin-code promotions, server start/stop) appends a row here
// so admins can see who did what. Writes are best-effort: an audit failure
// must never break or roll back the action it records, so logAudit swallows
// errors after logging them.

export type AuditAction =
  | "server_start"
  | "server_stop"
  | "ban"
  | "unban"
  | "role_change"
  | "permission_grant"
  | "permission_revoke"
  | "permissions_set"
  | "admin_code"
  | "announcement_create"
  | "announcement_toggle"
  | "announcement_delete";

export interface AuditInput {
  actorId: string;
  actorName: string;
  action: AuditAction;
  targetId?: string;
  targetName?: string;
  detail?: string;
}

/** Append one audit row. Never throws — the caller's action already happened. */
export async function logAudit(input: AuditInput): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.insert(auditLog).values({
      actorId: input.actorId,
      actorName: input.actorName,
      action: input.action,
      targetId: input.targetId ?? "",
      targetName: input.targetName ?? "",
      detail: (input.detail ?? "").slice(0, 500),
    });
  } catch (err) {
    console.error("logAudit: insert failed", err);
  }
}

/** Most recent audit rows (newest first) for the admin panel. */
export async function listAuditEntries(limit = 150): Promise<AuditEntry[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(Math.max(1, Math.min(limit, 500)));
  return rows.map((row) => ({
    id: row.id,
    actorId: row.actorId,
    actorName: row.actorName,
    action: row.action,
    targetId: row.targetId,
    targetName: row.targetName,
    detail: row.detail,
    createdAt: row.createdAt?.toISOString() ?? "",
  }));
}