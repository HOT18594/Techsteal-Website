import { NextRequest, NextResponse } from "next/server";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import {
  exarotonCreateDirectory,
  exarotonDeleteFile,
  exarotonGetFileInfo,
  exarotonReadFileText,
  exarotonWriteFileText,
  getExarotonConfig,
  sanitizeExarotonPath,
} from "@/lib/exaroton";
import { isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PROTECTED_DELETE_PATHS = new Set(["", "world", "world/level.dat", "server.properties", "ops.json"]);
const BLOCKED_FILENAMES = new Set(["session.lock"]);

function isBlockedFile(path: string): boolean {
  const base = path.split("/").pop()?.toLowerCase() ?? "";
  return BLOCKED_FILENAMES.has(base);
}

export async function GET(request: NextRequest) {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  if (!getExarotonConfig()) {
    return NextResponse.json({ error: "Exaroton is not configured." }, { status: 503 });
  }

  const rawPath = request.nextUrl.searchParams.get("path") ?? "";
  const mode = request.nextUrl.searchParams.get("mode") ?? "info";
  const path = sanitizeExarotonPath(rawPath);
  if (path === null) {
    return NextResponse.json({ error: "Invalid file path." }, { status: 400 });
  }

  try {
    if (mode === "read") {
      if (!path || isBlockedFile(path)) {
        return NextResponse.json({ error: "That file cannot be opened." }, { status: 400 });
      }
      const info = await exarotonGetFileInfo(path);
      if (info.isDirectory) {
        return NextResponse.json({ error: "Cannot read a folder as text." }, { status: 400 });
      }
      if (!info.isTextFile && !info.isConfigFile && !info.isLog) {
        return NextResponse.json(
          { error: "Binary file — only text, config, JSON, and log files can be opened here." },
          { status: 400 }
        );
      }
      const content = await exarotonReadFileText(path, 512_000);
      return NextResponse.json(
        { info, content },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const info = await exarotonGetFileInfo(path);
    if (Array.isArray(info.children)) {
      info.children.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
    }
    return NextResponse.json({ info }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("api/admin/server/files GET: failed", err);
    const msg = err instanceof Error ? err.message : "Couldn't read server files right now.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const admin = gate.account;

  if (isRateLimited(`adminserver-files:${admin.id}`, 15, 60_000)) {
    return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  }
  if (!getExarotonConfig()) {
    return NextResponse.json({ error: "Exaroton is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const path = sanitizeExarotonPath(typeof raw.path === "string" ? raw.path : "");
  if (!path || isBlockedFile(path)) {
    return NextResponse.json({ error: "Invalid target path." }, { status: 400 });
  }

  try {
    if (raw.mkdir === true) {
      await exarotonCreateDirectory(path);
      await logAudit({
        actorId: admin.id,
        actorName: admin.username,
        action: "server_file_write",
        targetName: path,
        detail: "Created folder",
      });
      return NextResponse.json({ ok: true, path });
    }

    if (typeof raw.content !== "string") {
      return NextResponse.json({ error: "Provide text content to save." }, { status: 400 });
    }
    if (Buffer.byteLength(raw.content, "utf8") > 512_000) {
      return NextResponse.json({ error: "File content exceeds the 512 KB editor limit." }, { status: 400 });
    }

    await exarotonWriteFileText(path, raw.content);
    await logAudit({
      actorId: admin.id,
      actorName: admin.username,
      action: "server_file_write",
      targetName: path,
      detail: `Saved ${Buffer.byteLength(raw.content, "utf8")} bytes`,
    });
    return NextResponse.json({ ok: true, path });
  } catch (err) {
    console.error("api/admin/server/files PUT: failed", err);
    return NextResponse.json(
      { error: "Couldn't write that file on Exaroton right now." },
      { status: 502 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const admin = gate.account;

  if (isRateLimited(`adminserver-files:${admin.id}`, 15, 60_000)) {
    return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  }
  if (!getExarotonConfig()) {
    return NextResponse.json({ error: "Exaroton is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const rawPath =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).path
      : request.nextUrl.searchParams.get("path");
  const path = sanitizeExarotonPath(typeof rawPath === "string" ? rawPath : "");
  if (!path || PROTECTED_DELETE_PATHS.has(path.toLowerCase()) || isBlockedFile(path)) {
    return NextResponse.json({ error: "That path is protected and cannot be deleted here." }, { status: 400 });
  }

  try {
    await exarotonDeleteFile(path);
    await logAudit({
      actorId: admin.id,
      actorName: admin.username,
      action: "server_file_delete",
      targetName: path,
    });
    return NextResponse.json({ ok: true, path });
  } catch (err) {
    console.error("api/admin/server/files DELETE: failed", err);
    return NextResponse.json(
      { error: "Couldn't delete that file on Exaroton right now." },
      { status: 502 }
    );
  }
}
