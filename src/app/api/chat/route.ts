import { NextRequest } from "next/server";
import { streamChatReply, type ChatTurn } from "@/lib/ai";
import { getSessionUser } from "@/lib/auth";
import { accountGate, ACCOUNT_DB_ERROR_MESSAGE, canUseAiAssistant } from "@/lib/accounts";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Tool-using agent: each round-trip can involve model calls + tool execution
// (status checks, DB lookups, web search), so give the whole request room.
export const maxDuration = 60;

const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  // no-transform stops buffering proxies from delaying the stream
  "Cache-Control": "no-cache, no-transform",
} as const;

// Chatty Jr. is a perk of verifying in the Discord server: you must be
  // signed in with Discord AND verified (or hold an explicit `ai_access`
  // grant / be an admin). Permissions are read from the database, not the
  // session cookie, so granting or revoking access takes effect immediately.
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

  // Live-account gate runs BEFORE the rate limiter: it distinguishes a
  // removed account (403) from a database outage (503 — during the pooler
  // incident this was reported as "Your account no longer exists").
  const gate = await accountGate(user.id);
  if (gate.status === "missing" || gate.status === "banned") {
    return new Response(
      "Your account no longer exists on this server.",
      { headers: TEXT_HEADERS, status: 403 }
    );
  }
  if (gate.status === "db_error") {
    return new Response(ACCOUNT_DB_ERROR_MESSAGE, { headers: TEXT_HEADERS, status: 503 });
  }
  const account = gate.status === "ok" ? gate.account : null;

  // Every message runs searches + LLM calls, so a hammering client burns
  // the AI budget — 10 messages/minute per member. Admins are exempt.
  if ((account?.role ?? user.role) !== "admin" && isRateLimited(`chat:${user.id}`, 10, 60_000)) {
    return new Response(
      "You're sending messages a bit fast — give me a minute to catch up! ⏳",
      { headers: TEXT_HEADERS, status: 429 }
    );
  }

  const allowed = account
    ? canUseAiAssistant(account)
    : user.role === "admin" || user.permissions.includes("ai_access");
  if (!allowed) {
    return new Response(
      "Verify you're in the official Discord server to chat with me — it's a member perk. 🔐",
      { headers: TEXT_HEADERS, status: 403 }
    );
  }

  // Optional conversation history from the client (validated again in the
  // AI layer) so follow-up questions keep their context.
  const history = Array.isArray(body.history)
    ? (body.history as ChatTurn[]).filter(
        (t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string"
      )
    : [];

  try {
    // request.signal aborts when the client disconnects (Stop / leave),
    // which cancels the upstream OpenRouter call too. The user block comes
    // from the live account (not the cookie) so the assistant knows who
    // it's talking to: name, role, MC name, verification, membership age.
    const stream = await streamChatReply(
      message,
      request.signal,
      {
        username: account?.username ?? user.username,
        role: account?.role ?? user.role,
        minecraftUsername: account?.minecraftUsername ?? null,
        discordVerified: account?.discordVerified ?? user.discordVerified ?? false,
        memberSince: account?.createdAt ?? null,
      },
      history
    );
    return new Response(stream, { headers: TEXT_HEADERS });
  } catch (err) {
    console.error("chatty: stream error", err);
    return new Response(
      "I couldn't reach the AI service right now. Try again in a moment.",
      { headers: TEXT_HEADERS, status: 502 }
    );
  }
}
