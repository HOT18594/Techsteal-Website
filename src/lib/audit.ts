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
  | "server_restart"
  | "server_command"
  | "server_ram"
  | "whitelist_add"
  | "whitelist_remove"
  | "whitelist_sync"
  | "ops_add"
  | "ops_remove"
  | "banlist_add"
  | "banlist_remove"
  | "ban"
  | "unban"
  | "role_change"
  | "permission_grant"
  | "permission_revoke"
  | "permissions_set"
  | "admin_code"
  | "member_update"
  | "member_verify"
  | "announcement_create"
  | "announcement_edit"
  | "announcement_toggle"
  | "announcement_delete"
  | "rule_create"
  | "rule_update"
  | "rule_delete"
  | "rule_reorder"
  | "timeline_create"
  | "timeline_update"
  | "timeline_delete"
  | "timeline_reorder"
  | "thread_pin"
  | "thread_lock"
  | "thread_edit"
  | "thread_delete"
  | "reply_pin"
  | "reply_edit"
  | "reply_delete"
  | "poll_end"
  | "poll_delete"
  | "gallery_feature"
  | "gallery_delete"
  | "gallery_comment_delete"
  | "storage_cleanup";

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