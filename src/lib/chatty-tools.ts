// Chatty Jr.'s tools — real, read-only lookups into the site's own data.
//
// The model calls these via OpenAI-style function calling; the agent loop in
// ai.ts executes them and feeds results back. Every tool returns compact
// text (capped) plus a human label the client shows as an activity chip
// ("Checking live status…"). Nothing here mutates state — Chatty is a
// support rep, not a sysadmin.

import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { getDb } from "./db";
import { forumReplies, forumThreads, galleryItems, profiles, ruleSections, timelineEvents } from "./schema";
import { getLiveStatus } from "./live-status";
import { formatSearchResults, webSearch } from "./web-search";

export interface ChattyToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  };
}

export interface ChattyToolResult {
  ok: boolean;
  label: string;
  content: string;
}

/** The tools advertised to the model (OpenAI function-calling schema). */
export const CHATTY_TOOLS: ChattyToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_server_status",
      description:
        "Live Minecraft server status right now: online/offline, player count, and the usernames currently online. Use for 'is the server up?' or 'who's online?' questions.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_members",
      description:
        "Search the site's member directory by (partial) username or Minecraft username. Returns role, Discord-verified status, and linked Minecraft name.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Partial name to search for. Omit to list members." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_rules",
      description: "The full server rules, exactly as published on the Rules page.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_server_history",
      description:
        "The server's season/event timeline (most recent first). Use for history, seasons, eras, and milestone questions.",
      parameters: {
        type: "object",
        properties: { era: { type: "string", description: "Optional era name to filter to." },
      },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_gallery",
      description: "Search build screenshots by title, builder, or category (e.g. 'farm', 'spawn').",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Partial title/builder/category to search for. Omit to list recent builds." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_forum",
      description:
        "Search forum discussions by keyword. Returns thread id, title, category, reply count, and a snippet. Use read_forum_thread with the id for full contents.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Keyword to search titles and bodies for." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_forum_thread",
      description: "Read one forum thread in full: the opening post and its replies.",
      parameters: {
        type: "object",
        properties: { id: { type: "number", description: "The thread id from search_forum." } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_site_stats",
      description:
        "Counts across the site: registered members, Discord-verified members, admins, forum threads and replies, gallery builds, and history events.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the public web (DuckDuckGo + Wikipedia) for general Minecraft knowledge — mechanics, crafting, mods, updates. NEVER use this for server-specific facts.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "The search query." } },
        required: ["query"],
      },
    },
  },
];

const NO_DB = "The site's database isn't connected, so this data isn't available.";

/** UI labels per tool — shown live while the tool runs and as a trace chip. */
export const TOOL_LABELS: Record<string, string> = {
  get_server_status: "Checking live status",
  search_members: "Searching members",
  get_rules: "Reading the rules",
  get_server_history: "Looking up history",
  search_gallery: "Searching the gallery",
  search_forum: "Searching the forum",
  read_forum_thread: "Reading a thread",
  get_site_stats: "Counting site stats",
  web_search: "Searching the web",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? "Working";
}

function cap(s: string, max = 1800): string {
  return s.length > max ? s.slice(0, max) + " …(truncated)" : s;
}

/** Escape LIKE wildcards so user input can't match everything. */
function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function runTool(name: string, args: Record<string, unknown>): Promise<ChattyToolResult> {
  switch (name) {
    case "get_server_status": {
      const label = "Checking live status";
      try {
        const status = await getLiveStatus();
        if (status.source !== "live") {
          return { ok: true, label, content: "Live status is unavailable right now (the status API is unreachable). Say so honestly." };
        }
        if (!status.online) {
          return { ok: true, label, content: `The server is currently ${status.stateLabel ?? "OFFLINE"}.` };
        }
        const names = (status.playerList ?? []).filter(Boolean);
        return {
          ok: true,
          label,
          content: `The server is ONLINE — ${status.players ?? 0}/${status.max ?? "?"} players. Version ${status.version ?? "unknown"}.${names.length ? ` Currently online: ${names.join(", ")}.` : " Nobody is online right now."}`,
        };
      } catch {
        return { ok: true, label, content: "Live status is unavailable right now." };
      }
    }

    case "search_members": {
      const label = "Searching members";
      const db = getDb();
      if (!db) return { ok: true, label, content: NO_DB };
      const q = typeof args.query === "string" ? args.query.trim().slice(0, 60) : "";
      const rows = await db
        .select({
          username: profiles.username,
          role: profiles.role,
          discordVerified: profiles.discordVerified,
          minecraftUsername: profiles.minecraftUsername,
        })
        .from(profiles)
        .where(
          q
            ? and(
                eq(profiles.banned, false),
                or(
                  ilike(profiles.username, `%${escapeLike(q)}%`),
                  ilike(profiles.minecraftUsername, `%${escapeLike(q)}%`)
                )
              )
            : eq(profiles.banned, false)
        )
        .orderBy(profiles.username)
        .limit(15);
      if (rows.length === 0) return { ok: true, label, content: q ? `No members match "${q}".` : "No members are registered yet." };
      return {
        ok: true,
        label,
        content: cap(
          `Members (${rows.length}${q ? ` matching "${q}"` : ""}):\n` +
            rows
              .map(
                (m) =>
                  `- ${m.username} — ${m.role === "admin" ? "admin" : "member"}${m.discordVerified ? ", Discord-verified" : ""}${m.minecraftUsername ? `, MC: ${m.minecraftUsername}` : ""}`
              )
              .join("\n")
        ),
      };
    }

    case "get_rules": {
      const label = "Reading the rules";
      const db = getDb();
      if (!db) return { ok: true, label, content: NO_DB };
      const sections = await db.select().from(ruleSections).limit(5);
      const text = sections
        .map((s) => `${s.title}:\n${(s.rules ?? []).map((r, i) => `${i + 1}. ${r}`).join("\n")}`)
        .join("\n\n");
      return { ok: true, label, content: text ? cap(text, 2400) : "No rules are published yet." };
    }

    case "get_server_history": {
      const label = "Looking up history";
      const db = getDb();
      if (!db) return { ok: true, label, content: NO_DB };
      const era = typeof args.era === "string" ? args.era.trim().slice(0, 60) : "";
      const rows = await db
        .select()
        .from(timelineEvents)
        .where(era ? ilike(timelineEvents.era, `%${era}%`) : undefined)
        .orderBy(desc(timelineEvents.id))
        .limit(30);
      if (rows.length === 0) return { ok: true, label, content: era ? `No events found for era "${era}".` : "No history events recorded yet." };
      return {
        ok: true,
        label,
        content: cap(
          `Server history (most recent first):\n` +
            rows
              .map((e) => `- ${e.date} — ${e.title} (${e.era})${e.major ? " ★ major" : ""}`)
              .join("\n")
        ),
      };
    }

    case "search_gallery": {
      const label = "Searching the gallery";
      const db = getDb();
      if (!db) return { ok: true, label, content: NO_DB };
      const q = typeof args.query === "string" ? args.query.trim().slice(0, 60) : "";
      const rows = await db
        .select()
        .from(galleryItems)
        .where(
          q
            ? or(
                ilike(galleryItems.title, `%${escapeLike(q)}%`),
                ilike(galleryItems.builder, `%${escapeLike(q)}%`),
                ilike(galleryItems.category, `%${escapeLike(q)}%`)
              )
            : undefined
        )
        .orderBy(desc(galleryItems.id))
        .limit(12);
      if (rows.length === 0) return { ok: true, label, content: q ? `No builds match "${q}".` : "No builds are posted yet." };
      return {
        ok: true,
        label,
        content: cap(
          `Gallery builds (${rows.length}${q ? ` matching "${q}"` : ", newest first"}):\n` +
            rows.map((g) => `- ${g.title} — ${g.category} — by ${g.builder} — ${g.likes} likes`).join("\n")
        ),
      };
    }

    case "search_forum": {
      const label = "Searching the forum";
      const db = getDb();
      if (!db) return { ok: true, label, content: NO_DB };
      const q = typeof args.query === "string" ? args.query.trim().slice(0, 80) : "";
      if (!q) return { ok: false, label, content: "A search keyword is required." };
      const rows = await db
        .select()
        .from(forumThreads)
        .where(
          or(
            ilike(forumThreads.title, `%${escapeLike(q)}%`),
            ilike(forumThreads.content, `%${escapeLike(q)}%`)
          )
        )
        .orderBy(desc(forumThreads.createdAt))
        .limit(8);
      if (rows.length === 0) return { ok: true, label, content: `No forum threads match "${q}".` };
      return {
        ok: true,
        label,
        content: cap(
          `Forum threads matching "${q}" (id — title — category — replies):\n` +
            rows
              .map((t) => {
                const firstLine = (t.content ?? "").split("\n").map((l) => l.trim()).find((l) => l.length > 0)?.slice(0, 100);
                return `- #${t.id} — ${t.title} — ${t.category} — ${t.replies} replies${firstLine ? ` — "${firstLine}"` : ""}`;
              })
              .join("\n")
        ),
      };
    }

    case "read_forum_thread": {
      const label = "Reading a thread";
      const db = getDb();
      if (!db) return { ok: true, label, content: NO_DB };
      const id = Number(args.id);
      if (!Number.isInteger(id)) return { ok: false, label, content: "A numeric thread id is required." };
      const [thread] = await db.select().from(forumThreads).where(eq(forumThreads.id, id)).limit(1);
      if (!thread) return { ok: true, label, content: `Thread #${id} doesn't exist.` };
      const replies = await db
        .select({ content: forumReplies.content, author: forumReplies.author, likes: forumReplies.likes })
        .from(forumReplies)
        .where(eq(forumReplies.threadId, id))
        .orderBy(desc(forumReplies.id))
        .limit(6);
      return {
        ok: true,
        label,
        content: cap(
          `Thread #${thread.id}: "${thread.title}" (${thread.category}, by ${thread.author}, ${thread.replies} replies)\n\nOpening post:\n${(thread.content ?? "").slice(0, 900)}` +
            (replies.length ? `\n\nRecent replies:\n${replies.map((r) => `- ${r.author}: ${r.content.slice(0, 200)} (${r.likes} likes)`).join("\n")}` : "")
        ),
      };
    }

    case "get_site_stats": {
      const label = "Counting site stats";
      const db = getDb();
      if (!db) return { ok: true, label, content: NO_DB };
      const [[memberCount], [threadCount], [replyCount], [buildCount], [eventCount]] = await Promise.all([
        db.select({ n: count() }).from(profiles).where(eq(profiles.banned, false)),
        db.select({ n: count() }).from(forumThreads),
        db.select({ n: count() }).from(forumReplies),
        db.select({ n: count() }).from(galleryItems),
        db.select({ n: count() }).from(timelineEvents),
      ]);
      return {
        ok: true,
        label,
        content: `Site stats: ${memberCount.n} registered members, ${threadCount.n} forum threads, ${replyCount.n} forum replies, ${buildCount.n} gallery builds, ${eventCount.n} history events.`,
      };
    }

    case "web_search": {
      const label = "Searching the web";
      const q = typeof args.query === "string" ? args.query.trim().slice(0, 200) : "";
      if (!q) return { ok: false, label, content: "A search query is required." };
      const results = await webSearch(q);
      return { ok: true, label, content: results.length ? cap(formatSearchResults(results)) : `No web results found for "${q}".` };
    }

    default:
      return { ok: false, label: "Unknown tool", content: `Unknown tool "${name}".` };
  }
}

/** Execute a tool call; never throws — failures become model-facing notes. */
export async function executeChattyTool(
  name: string,
  rawArgs: string
): Promise<ChattyToolResult> {
  let args: Record<string, unknown> = {};
  if (typeof rawArgs === "string" && rawArgs.trim()) {
    try {
      const parsed = JSON.parse(rawArgs);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
    } catch {
      /* malformed args — run with defaults */
    }
  }
  try {
    return await runTool(name, args);
  } catch (err) {
    console.error("chatty: tool failed", name, err);
    return { ok: false, label: "Tool failed", content: "That lookup failed on the server — answer from what you already know, and say you couldn't fetch fresh data." };
  }
}
