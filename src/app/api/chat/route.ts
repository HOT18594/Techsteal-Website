import { NextRequest } from "next/server";
import { streamChatReply } from "@/lib/ai";
import { getSessionUser } from "@/lib/auth";
import { findAccount, hasPermission } from "@/lib/accounts";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  // no-transform stops buffering proxies from delaying the stream
  "Cache-Control": "no-cache, no-transform",
} as const;

// Chatty Jr. is a member perk: you must be signed in with Discord AND
// hold the `ai_access` permission (admins always have it). Permissions
// are read from the database, not the session cookie, so granting or
// revoking access in the Manage Panel takes effect immediately.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return new Response("Please send a message.", { headers: TEXT_HEADERS, status: 400 });
  }
  // Cap the message so one request can't blast a megabyte at the AI (which
  // is billed per token and also runs web searches on every turn).
  if (message.length > 2000) {
    return new Response(
      "That's a little long for me — try breaking it into shorter messages.",
      { headers: TEXT_HEADERS, status: 400 }
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return new Response(
      "Sign in with Discord to chat with Chatty Jr. — it's a member perk. 🚪",
      { headers: TEXT_HEADERS, status: 401 }
    );
  }

  const account = await findAccount(user.id).catch(() => null);
  if (!account && getDb()) {
    // The account was deleted after login — the cookie must not keep working.
    return new Response(
      "Your account no longer exists on this server.",
      { headers: TEXT_HEADERS, status: 403 }
    );
  }
  const allowed = account
    ? hasPermission(account, "ai_access")
    : user.role === "admin" || user.permissions.includes("ai_access");
  if (!allowed) {
    return new Response(
      "You don't have AI access yet — ask an admin to grant it in the Manage Panel. 🔐",
      { headers: TEXT_HEADERS, status: 403 }
    );
  }

  try {
    // request.signal aborts when the client disconnects (Stop / leave),
    // which cancels the upstream OpenRouter call too.
    const stream = await streamChatReply(message, request.signal, {
      username: user.username,
      role: user.role,
    });
    return new Response(stream, { headers: TEXT_HEADERS });
  } catch (err) {
    console.error("chatty: stream error", err);
    return new Response(
      "I couldn't reach the AI service right now. Try again in a moment.",
      { headers: TEXT_HEADERS }
    );
  }
}
