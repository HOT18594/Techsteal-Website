import { NextRequest } from "next/server";
import { streamChatReply } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

const TEXT_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  // no-transform stops buffering proxies from delaying the stream
  "Cache-Control": "no-cache, no-transform",
} as const;

// Stream Chatty Jr.'s reply as plain text. The client reads chunks and
// renders them as they arrive (real streaming, not one big JSON blob).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return new Response("Please send a message.", { headers: TEXT_HEADERS });
  }

  try {
    // request.signal aborts when the client disconnects (Stop / leave),
    // which cancels the upstream OpenRouter call too.
    const stream = await streamChatReply(message, request.signal);
    return new Response(stream, { headers: TEXT_HEADERS });
  } catch (err) {
    console.error("chatty: stream error", err);
    return new Response(
      "I couldn't reach the AI service right now. Try again in a moment.",
      { headers: TEXT_HEADERS }
    );
  }
}
