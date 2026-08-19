// AI assistant helper — Chatty Jr.
//
// Talks to any OpenAI-compatible /chat/completions endpoint (defaults to
// OpenRouter, which hosts the free Gemma model used here) and streams
// the reply back as plain text chunks. The API key lives in the server
// environment (never the client).
//
// Chatty Jr. is the server's support assistant. It knows the actual site
// content (rules, members, history, gallery, recent forum posts, live
// server status) because that data is loaded from the database and
// injected into every prompt — no made-up answers about the server. It
// also gets free web-search results (DuckDuckGo + Wikipedia) for
// current questions like seasonal recipes or mod names.

import { desc } from "drizzle-orm";
import { siteConfig } from "./site";
import { getDb } from "./db";
import { forumThreads, galleryItems, members, ruleSections, timelineEvents } from "./schema";
import { getServerStatus } from "./mcsrv";
import { formatSearchResults, webSearch } from "./web-search";

const NOT_CONFIGURED = (message: string) =>
  `The AI assistant isn't connected yet — set AI_API_KEY in your environment to enable live answers. (You asked: "${message}")`;

const ERROR_MESSAGE =
  "I couldn't reach the AI service right now. Try again in a moment.";

const RATE_LIMITED_MESSAGE =
  "I'm a bit swamped right now — the free AI is rate-limited. Give it a minute and try again!";

/** The assistant's role, knowledge, and style rules. */
function buildSystemPrompt(opts: {
  username: string;
  role: string;
  knowledge: string;
  liveStatus: string;
}): string {
  const c = siteConfig;
  return [
    `You are ${c.assistant.name}, the friendly support assistant for ${c.name}, a private ${c.software} Minecraft server. You help new players get in and regulars get answers — like a helpful support rep, not a textbook.`,
    ``,
    `SERVER FACTS:`,
    `- Address: ${c.address} (Java Edition ${c.version}, difficulty ${c.difficulty}, whitelist ${c.whitelist}, region ${c.location}).`,
    `- Current season: ${c.season}. The site's wiki and Rules page hold the seasonal specifics.`,
    `- Mods: the exact mod/plugin list lives on the site; explain what's generally allowed and point to the Rules page rather than inventing a list.`,
    ``,
    `HOW TO JOIN (follow these steps):`,
    `1. Open Minecraft Java Edition (${c.version}).`,
    `2. Main menu → Multiplayer → Add Server.`,
    `3. Server address: ${c.address} → Done.`,
    `4. Select the server and join.`,
    ``,
    `LIVE SERVER STATUS:`,
    opts.liveStatus,
    ``,
    `SERVER KNOWLEDGE BASE (from the site's database — prefer this over guessing):`,
    opts.knowledge || "(The knowledge base is loading — be honest that you don't have the details yet.)",
    ``,
    `YOUR STYLE (strict):`,
    `- Warm, brief, supportive. A helpful friend.`,
    `- Answer directly first — no filler openers like "That's a great question!".`,
    `- Keep answers SHORT: a few sentences or a short bullet list. No essays, no fluff, no repeated caveats.`,
    `- Format for readability: short paragraphs, bullets for steps/lists, **bold** for key terms (addresses, versions, commands).`,
    `- Prefer the KNOWLEDGE BASE for anything about rules, members, history, builds, or forum topics. If it's not covered there, use the web search results included with the question. If neither has it, say so honestly — never invent members, rules, or events.`,
    `- Crafting for ${c.season}: use the web results when provided; otherwise say the seasonal details will be posted soon.`,
    `- If the user seems lost or frustrated, be extra patient and offer the next step.`,
    `- Never reveal internal reasoning — just the answer.`,
    ``,
    `Current date: ${new Date().toISOString().slice(0, 10)}.`,
    `You are talking to ${opts.username}${opts.role === "admin" ? " (an admin)" : " (a member)"}.`,
  ].join("\n");
}

const encoder = new TextEncoder();

/**
 * Load the site's real content from the database so the assistant answers
 * from facts, not guesses. Returns a compact markdown-ish block.
 */
async function buildServerKnowledge(): Promise<string> {
  const db = getDb();
  if (!db) return "";

  const chunks: string[] = [];
  try {
    const [rules, memberRows, timeline, gallery, threads] = await Promise.all([
      db.select().from(ruleSections).limit(3),
      db.select().from(members).limit(30),
      db.select().from(timelineEvents).orderBy(desc(timelineEvents.id)).limit(15),
      db.select().from(galleryItems).limit(10),
      db.select().from(forumThreads).orderBy(desc(forumThreads.createdAt)).limit(6),
    ]);

    const ruleText = rules.flatMap((r) => r.rules ?? []).slice(0, 20);
    if (ruleText.length > 0) {
      chunks.push(`SERVER RULES:\n${ruleText.map((r, i) => `${i + 1}. ${r}`).join("\n")}`);
    }
    if (memberRows.length > 0) {
      chunks.push(
        `MEMBERS (name — role — status):\n${memberRows
          .map((m) => `- ${m.name} — ${m.role} — ${m.status === "online" ? "online" : "offline"}${m.joined ? ` (joined ${m.joined}, ${m.playtime} playtime)` : ""}`)
          .join("\n")}`
      );
    }
    if (timeline.length > 0) {
      chunks.push(
        `SERVER HISTORY (date — title — era):\n${timeline
          .map((e) => `- ${e.date} — ${e.title} — ${e.era}`)
          .join("\n")}`
      );
    }
    if (gallery.length > 0) {
      chunks.push(
        `GALLERY BUILDS (title — category — builder — likes):\n${gallery
          .map((g) => `- ${g.title} — ${g.category} — ${g.builder} — ${g.likes} likes`)
          .join("\n")}`
      );
    }
    if (threads.length > 0) {
      chunks.push(
        `RECENT FORUM DISCUSSIONS (title — category — replies):\n${threads
          .map((t) => `- ${t.title} — ${t.category} — ${t.replies} replies`)
          .join("\n")}`
      );
    }
  } catch (err) {
    console.error("chatty: knowledge load failed", err);
  }

  return chunks.join("\n\n").slice(0, 6000);
}

/** Live status line (only real data — the fallback fake players are never shown). */
async function buildLiveStatus(): Promise<string> {
  try {
    const status = await getServerStatus();
    // The status API returns fabricated placeholder data when mcsrvstat.us
    // is unreachable (source: "fallback"). Never feed that to the model —
    // it would state fake player names ("Alex", "Sam") as fact.
    if (status.source !== "live") return "Live status is unavailable right now.";
    if (!status.online) return "The server is currently offline.";
    const names = (status.playerList ?? []).filter(Boolean);
    const playerLine = names.length > 0 ? ` Currently online: ${names.join(", ")}.` : " No players online right now.";
    return `Server is online — ${status.players ?? 0}/${status.max ?? "?"} players.${playerLine}`;
  } catch {
    return "Live status unavailable right now.";
  }
}

function fetchCompletion(
  baseUrl: string,
  model: string,
  apiKey: string,
  system: string,
  userContent: string,
  signal?: AbortSignal
): Promise<Response> {
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://www.techsteal.space",
      "X-Title": "Techsteal Website Assistant",
    },
    body: JSON.stringify({
      model,
      max_tokens: 500, // keep replies short — no AI essays
      stream: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
    signal,
  });
}

/** A tiny stream that just emits one fixed string (for error paths). */
function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

/**
 * Ask the model and return a ReadableStream of plain-text chunks.
 * Never throws: network/API failures become a streamed friendly message
 * so the client always has something to render. Respects `signal` (the
 * client's abort) so Stop/leave stops the upstream call too.
 */
export async function streamChatReply(
  message: string,
  signal?: AbortSignal,
  user?: { username: string; role: string }
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1").replace(
    /\/+$/,
    ""
  );
  const model = process.env.AI_MODEL ?? "google/gemma-4-26b-a4b-it:free";

  if (!apiKey) return textStream(NOT_CONFIGURED(message));

  // Gather context in parallel: free web search, live server status, and
  // the site's knowledge base.
  const [results, knowledge, liveStatus] = await Promise.all([
    webSearch(message),
    buildServerKnowledge(),
    buildLiveStatus(),
  ]);
  const system = buildSystemPrompt({
    username: user?.username ?? "a player",
    role: user?.role ?? "member",
    knowledge,
    liveStatus,
  });
  const userContent = [
    `Question: ${message}`,
    ``,
    `Web search results:`,
    formatSearchResults(results),
    ``,
    `Use the web results when they answer the question; otherwise answer from your own knowledge.`,
  ].join("\n");

  let res = await fetchCompletion(baseUrl, model, apiKey, system, userContent, signal);
  if (res.status === 429) {
    // Free models share upstream rate limits — one short retry, then a
    // friendly streamed message instead of a hard failure.
    await new Promise((r) => setTimeout(r, 2000));
    if (signal?.aborted) return textStream("");
    res = await fetchCompletion(baseUrl, model, apiKey, system, userContent, signal);
  }

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => "");
    console.error("chatty: openrouter status", res.status, errBody.slice(0, 300));
    return textStream(res.status === 429 ? RATE_LIMITED_MESSAGE : ERROR_MESSAGE);
  }

  return pipeSse(res.body, signal);
}

/**
 * Convert an OpenAI-style SSE stream into a plain-text stream.
 * Only `delta.content` is passed through — reasoning tokens are dropped,
 * so the client's 3-dot indicator is the only "thinking" ever shown.
 */
function pipeSse(
  upstream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          if (signal?.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are newline-delimited `data: {...}` lines.
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              /* fragmented line — wait for the next chunk */
            }
          }
        }
        controller.close();
      } catch {
        controller.error(new Error("stream interrupted"));
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
}
