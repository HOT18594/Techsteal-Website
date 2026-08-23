"use client";

// Chatty Jr. — the site's AI assistant, now a tool-using agent.
//   - "full":     the standalone assistant page — a two-pane app: identity/
//                 capability/prompt sidebar rail beside a focused chat console
//   - "embedded": a compact card you can drop on any page (e.g. /join)
// The backend streams NDJSON events: text chunks plus live tool activity
// ("Checking live status…") which render as chips on the reply. History
// lives in localStorage; the 3-dot indicator only shows before the first
// event arrives.

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { siteConfig } from "@/lib/site";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/Toast";
import { useSession } from "@/lib/use-session";

interface ToolTrace {
  name: string;
  label: string;
}

/** NDJSON events the chat API streams (one JSON object per line). */
interface StreamEvent {
  t?: string;
  v?: string;
  name?: string;
  label?: string;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  time: string;
  /** Small diagnostics line (time-to-first-token · tokens/sec), AI replies only. */
  stats?: string;
  /** True when the reply failed — renders as an error bubble with Retry. */
  error?: boolean;
  /** The question to re-send when Retry is clicked on an error bubble. */
  retry?: string;
  /** Tools the assistant used while producing this reply. */
  tools?: ToolTrace[];
}

const SUGGESTIONS = [
  { icon: "fa-signal", title: "Is the server up?", hint: "Live status + who's online", text: "Is the server up right now? Who's online?" },
  { icon: "fa-gavel", title: "Rules refresher", hint: "Straight from the Rules page", text: "What are the server rules?" },
  { icon: "fa-compass", title: "How do I join?", hint: "Steps + server address", text: "How do I join the server?" },
  { icon: "fa-images", title: "Show me builds", hint: "Straight from the gallery", text: "What builds are in the gallery?" },
  { icon: "fa-comments", title: "Forum digest", hint: "What the community's saying", text: "What's the community talking about on the forum?" },
  { icon: "fa-globe", title: "Minecraft help", hint: "General game questions", text: "What's the fastest way to find ancient debris?" },
] as const;

/** Tool name → icon for the activity/trace chips. */
const TOOL_ICONS: Record<string, string> = {
  get_server_status: "fa-signal",
  search_members: "fa-users",
  get_rules: "fa-gavel",
  get_server_history: "fa-clock-rotate-left",
  search_gallery: "fa-images",
  search_forum: "fa-comments",
  read_forum_thread: "fa-comment-dots",
  get_site_stats: "fa-chart-simple",
  web_search: "fa-globe",
};

const STORAGE_KEY = "techsteal-nova-chat-v1";

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function loadHistory(): ChatMessage[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function Chatty({ variant = "full" }: { variant?: "full" | "embedded" }) {
  const embedded = variant === "embedded";
  const { show } = useToast();
  const { user, loading: sessionLoading } = useSession();
  const ai = siteConfig.assistant;
  // Chatty Jr. is a perk of verifying in the Discord server: verified
  // members can chat, plus anyone with an explicit `ai_access` grant, and
  // admins always can. The server re-checks on every message; this gate
  // just decides which UI to show.
  const hasAccess =
    user !== null &&
    (user.role === "admin" ||
      user.discordVerified === true ||
      user.permissions.includes("ai_access"));

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: "assistant",
      text: `Hey — I'm ${ai.name}, ${siteConfig.name}'s assistant. I can check live server status, look up members, rules, builds, and forum threads, and answer general Minecraft questions. What can I do for you?`,
      // `time` is filled in after mount: calling nowTime() here would run
      // on the server (Vercel, UTC) AND the browser (local timezone) with
      // different results, causing a hydration mismatch on every load.
      time: "",
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [dots, setDots] = useState(false); // 3-dot indicator while waiting for the first event
  const [activeTools, setActiveTools] = useState<ToolTrace[]>([]); // tools used by the reply in flight
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);
  const genRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const autoAsked = useRef(false);
  const activeToolsRef = useRef<ToolTrace[]>([]);
  // Autoscroll only while the reader is already at (or near) the bottom —
  // streaming tokens must not yank the view away from earlier messages.
  const stickToBottom = useRef(true);
  // Panel-scoped keyboard shortcut: "/" focuses the input (ignore while
  // typing). Only bound when the chat UI itself is shown — signed-out /
  // unverified visitors keep "/" for their browser (e.g. quick find).
  useEffect(() => {
    if (!user || !hasAccess) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || typing) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [typing, user, hasAccess]);

  // Load persisted history once, after mount — the initializer above must
  // NOT read localStorage, or SSR and client render different first frames
  // (hydration mismatch).
  useEffect(() => {
    const history = loadHistory();
    if (history && history.length > 0) {
      setMessages(history);
      nextId.current = history.reduce((max, m) => Math.max(max, m.id), 0) + 1;
    } else {
      // No saved chat — stamp the welcome message with the browser's time
      // (client-only, so it can never mismatch the server-rendered frame).
      setMessages((m) => m.map((msg) => (msg.id === 0 ? { ...msg, time: nowTime() } : msg)));
    }
    setHydrated(true);
  }, []);

  // Persist history — but only once hydrated, so the welcome state never
  // overwrites saved chats. Capped to the last 50 messages so the stored
  // payload can't grow without bound.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
    } catch {}
  }, [messages, hydrated]);

  // Keep the newest message in view — no scrolling the page to read it —
  // but only while the reader hasn't scrolled up to re-read something.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, typing, activeTools]);

  // Navigating away mid-stream must not leave the request running.
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  // Personalize the welcome bubble once we know who's logged in — only
  // while the chat is still in its fresh (welcome-only) state.
  useEffect(() => {
    if (!hydrated || !user) return;
    setMessages((m) => {
      if (m.length !== 1 || m[0]?.id !== 0) return m;
      return [
        {
          ...m[0],
          text: user.minecraftUsername
            ? `Hey ${user.username} — I'm ${ai.name}, ${siteConfig.name}'s assistant. I can check live server status, look up members, rules, builds, and forum threads, and answer general Minecraft questions. What can I do for you?`
            : `Hey ${user.username} — I'm ${ai.name}, ${siteConfig.name}'s assistant. Ask me anything about the server — and when you get a chance, link your Minecraft username in Settings so your skin shows up around the site.`,
        },
      ];
    });
  }, [hydrated, user, ai.name]);

  // Auto-ask a prefill question when navigated to with ?ask=... — only
  // after history has loaded, only if the chat is still the welcome state,
  // and only for members with AI access. The prefill is evaluated exactly
  // once: otherwise "New chat" emptying the list would re-fire a stale
  // question the user never typed.
  useEffect(() => {
    if (!hydrated || autoAsked.current) return;
    if (!hasAccess) return;
    const params = new URLSearchParams(window.location.search);
    const ask = params.get("ask");
    if (!ask) return;
    autoAsked.current = true;
    if (messages.length > 1) return; // already has a real conversation
    void send(ask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, messages.length, hasAccess]);

  const send = async (raw?: string, baseMessages?: ChatMessage[]) => {
    const text = (raw ?? input).trim();
    if (!text || typing) return;
    const gen = ++genRef.current; // invalidates any in-flight request
    const controller = new AbortController();
    controllerRef.current = controller;
    const basis = baseMessages ?? messages;

    stickToBottom.current = true; // sending means "show me the newest"
    setMessages((m) => [
      ...m,
      { id: nextId.current++, role: "user", text, time: nowTime() },
    ]);
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setTyping(true);
    setDots(true);
    activeToolsRef.current = [];
    setActiveTools([]);

    // Prior turns give the model context for follow-ups ("what about
    // rule 3?"). Skip the welcome message (id 0); cap and truncate lightly.
    const priorTurns = basis
      .filter((m) => m.id !== 0 && m.text.trim().length > 0)
      .slice(-8)
      .map((m) => ({
        role: m.role,
        content: m.text.slice(0, 2000),
      }));

    // Streaming diagnostics — measured from the moment the request fires.
    const t0 = Date.now();
    let firstTokenAt: number | null = null;
    let chars = 0;
    // tok/s counts only time actually streaming text — wall-clock spans
    // across tool rounds would report misleadingly slow rates.
    let genMs = 0;
    let lastTextAt: number | null = null;
    const TEXT_GAP_CAP_MS = 5_000; // ignore long pauses (tool execution)

    // Appends/updates the streaming assistant bubble (with live tool trace).
    let assistantId: number | null = null;
    const updateAssistant = (partial: string, error = false, retry?: string) => {
      const tools = [...activeToolsRef.current];
      if (assistantId === null) {
        const id = nextId.current++;
        assistantId = id;
        setMessages((m) => [
          ...m,
          { id, role: "assistant", text: partial, time: nowTime(), error, retry, tools },
        ]);
      } else {
        setMessages((m) =>
          m.map((msg) => (msg.id === assistantId ? { ...msg, text: partial, error, retry, tools } : msg))
        );
      }
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: priorTurns }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // 401 sign-in / 403 no-access etc. — the server streams a friendly
        // explanation, show it as the reply.
        const gateText = await res.text().catch(() => "");
        if (gen !== genRef.current) return;
        setDots(false);
        updateAssistant(
          gateText.trim() || "Hmm, something went wrong — check your access and try again."
        );
        return;
      }
      if (!res.body) throw new Error(`chat returned ${res.status}`);

      // NDJSON events: {"t":"text"|"tool"|"error", ...} one per line.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let buffer = "";
      let failed = false;

      // One decoded NDJSON line → state updates. Shared by the read loop
      // and the final tail flush below.
      const handleLine = (trimmed: string) => {
        if (!trimmed) return;
        let ev: StreamEvent | null = null;
        try {
          ev = JSON.parse(trimmed) as StreamEvent;
        } catch {
          ev = null;
        }
        if (ev && ev.t === "text" && ev.v) {
          if (firstTokenAt === null) firstTokenAt = Date.now();
          setDots(false); // first word arrived — drop the 3-dot indicator
          acc += ev.v;
          chars += ev.v.length;
          const now2 = Date.now();
          if (lastTextAt !== null) {
            genMs += Math.min(now2 - lastTextAt, TEXT_GAP_CAP_MS);
          }
          lastTextAt = now2;
          updateAssistant(acc);
        } else if (ev && ev.t === "tool" && ev.name) {
          const trace = { name: ev.name, label: ev.label ?? "Working…" };
          activeToolsRef.current = [...activeToolsRef.current, trace];
          setActiveTools(activeToolsRef.current);
          setDots(false); // real activity to show instead of dots
        } else if (ev && ev.t === "error" && ev.v) {
          failed = true;
          updateAssistant(acc ? `${acc}\n\n${ev.v}` : ev.v, true, text);
        } else if (!ev) {
          // Not JSON — treat as plain text (defensive; older servers).
          acc += trimmed + "\n";
          chars += trimmed.length;
          updateAssistant(acc);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (gen !== genRef.current) {
          controller.abort(); // stopped or superseded
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          handleLine(line.trim());
        }
      }
      // Flush the decoder and drain any final line that arrived without a
      // trailing newline (stream cut off mid-line by a timeout/proxy) so a
      // complete last event isn't silently dropped.
      buffer += decoder.decode();
      for (const line of buffer.split("\n")) {
        handleLine(line.trim());
      }
      buffer = "";
      if (gen !== genRef.current) return;
      if (!failed) {
        updateAssistant(acc.trim() || "Hmm, I didn't quite catch that — could you rephrase?");
      }

      // Done streaming — stamp diagnostics onto the reply.
      if (!failed && firstTokenAt !== null) {
        const ttftSec = (firstTokenAt - t0) / 1000;
        const genDuration = genMs / 1000;
        const estTokens = chars / 4; // ~4 chars per token for English text
        const tps = genDuration > 0 ? estTokens / genDuration : 0;
        if (assistantId !== null) {
          const stats = `⚡ ${tps.toFixed(1)} tok/s · first token ${ttftSec.toFixed(1)}s`;
          setMessages((m) =>
            m.map((msg) => (msg.id === assistantId ? { ...msg, stats } : msg))
          );
        }
      }
    } catch {
      if (gen !== genRef.current) return; // stopped — keep partial text
      // A failed request must NOT look like an AI answer — mark the bubble
      // as an error and offer to re-send the question.
      updateAssistant("Something went wrong reaching me — check your connection.", true, text);
    } finally {
      if (gen === genRef.current) {
        setTyping(false);
        setDots(false);
        setActiveTools([]);
      }
      // Only clear OUR controller — a newer send may have installed its own
      // controllerRef while this request was finishing, and nulling that
      // would make Stop a no-op until the next stream chunk.
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const stop = () => {
    genRef.current++; // invalidate the in-flight request
    controllerRef.current?.abort();
    setTyping(false);
    setDots(false);
    setActiveTools([]);
  };

  const clear = () => {
    genRef.current++;
    controllerRef.current?.abort();
    setTyping(false);
    setDots(false);
    setActiveTools([]);
    setMessages([
      {
        id: nextId.current++,
        role: "assistant",
        text: `Chat cleared. Ask me anything about ${siteConfig.name}.`,
        time: nowTime(),
      },
    ]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const copyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      show("Copied to clipboard");
    } catch {
      show("Couldn't copy");
    }
  };

  /** Re-run the last question: drop the final answer(s) and resend, with
   *  context rebuilt from the trimmed conversation (no stale-answer bias). */
  const regenerate = () => {
    if (typing) return;
    const cut = [...messages];
    while (cut.length > 1 && cut[cut.length - 1].role === "assistant") cut.pop();
    const lastUser = cut.length > 1 ? cut[cut.length - 1].text : null;
    if (!lastUser) return;
    // Drop the question here too — send() re-adds it. Setting the full `cut`
    // AND letting send() append would render the question twice.
    setMessages(cut.slice(0, -1));
    void send(lastUser, cut.slice(0, -1)); // exclude the question from context — send() re-adds it
  };

  const isEmpty = messages.length <= 1 && messages[0]?.role === "assistant";
  const lastMsg = messages[messages.length - 1];
  const canRegenerate =
    !embedded && !typing && lastMsg?.role === "assistant" && !lastMsg?.error && messages.length > 1;

  // Gate screens share one shell.
  const gateClass = embedded ? "min-h-[26rem]" : "min-h-[24rem]";

  // ------------------------------------------------------------------
  // The console: gates when gated, otherwise the chat card. Shared by both
  // variants (heights adapt via `embedded`).
  // ------------------------------------------------------------------
  const consoleBody = sessionLoading ? (
    <div className={`card p-8 text-center flex items-center justify-center ${gateClass}`}>
      <p className="text-sm text-[var(--muted)]">Checking session…</p>
    </div>
  ) : !user ? (
    <div className={`card p-8 text-center flex flex-col items-center justify-center ${gateClass}`}>
      <div className="w-14 h-14 rounded-2xl bg-[#5865F2] text-white flex items-center justify-center text-2xl mb-4 shadow-[0_10px_30px_-10px_rgba(88,101,242,0.7)]">
        <i className="fa-brands fa-discord" />
      </div>
      <h2 className="font-display text-xl font-bold mb-2">Sign in to chat with {ai.name}</h2>
      <p className="text-sm text-[var(--muted)] mb-6 max-w-sm">
        {ai.name} is a member perk — log in with Discord to start chatting.
      </p>
      <Link href="/login" className="btn-primary justify-center">
        <i className="fa-brands fa-discord" />
        Log in with Discord
      </Link>
    </div>
  ) : !hasAccess ? (
    <div className={`card p-8 text-center flex flex-col items-center justify-center ${gateClass}`}>
      <div className="w-14 h-14 rounded-2xl bg-[var(--accent-dim)] border border-[var(--border-strong)] text-[var(--accent)] flex items-center justify-center text-2xl mb-4">
        <i className="fa-solid fa-lock" />
      </div>
      <h2 className="font-display text-xl font-bold mb-2">Not verified yet</h2>
      <p className="text-sm text-[var(--muted)] max-w-sm">
        Verify you&apos;re in the official Discord server to unlock the AI assistant,
        Gallery posting, and Server Control.
      </p>
      <Link href="/settings" className="btn-primary justify-center mt-6">
        <i className="fa-solid fa-user-check" />
        Verify in Settings
      </Link>
    </div>
  ) : (
    <div
      className={`card flex flex-col overflow-hidden ${
        embedded
          ? "h-[26rem]"
          : "h-[calc(100dvh-13rem)] min-h-[26rem]"
      }`}
    >
      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 min-h-0 overflow-y-auto"
        id="chat-messages"
        aria-live="polite"
      >
        <div className="px-4 sm:px-6 py-6 space-y-5">
          {/* Welcome hero — only when fresh. Compact prompt pills cover
              touch/small screens where the sidebar rail isn't rendered. */}
          {isEmpty && !typing ? (
            <div className={`${embedded ? "pb-4" : "pb-6"} flex flex-col items-center text-center`}>
              <div className={`relative ${embedded ? "mb-3" : "mb-4"}`}>
                <div className={`${embedded ? "w-14 h-14 text-2xl" : "w-20 h-20 text-3xl"} bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center text-white rounded-2xl shadow-[0_14px_40px_-14px_var(--accent-glow)]`}>
                  <i className="fa-solid fa-robot" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[var(--emerald)] border-2 border-[var(--card)] rounded-full shadow-[0_0_10px_var(--emerald-glow)]" />
              </div>
              <h2 className={`font-display font-bold ${embedded ? "text-lg" : "text-2xl"}`}>
                Hey{user?.username ? ` ${user.username}` : ""} — I&apos;m {ai.name}
              </h2>
              <p className={`text-sm text-[var(--muted)] mt-1.5 max-w-md ${embedded ? "px-2" : ""}`}>
                Your guide to {siteConfig.name}. I pull live server data, look
                anything up on the site, and search the web for general
                Minecraft questions.
              </p>
              {/* Fresh-state prompt pills — quick starts, every screen size. */}
              <div className="flex flex-wrap justify-center gap-1.5 mt-4 max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    className="chat-cap-chip hover:border-[var(--accent)] transition disabled:opacity-50"
                    onClick={() => void send(s.text)}
                    disabled={typing}
                  >
                    <i className={`fa-solid ${s.icon}`} aria-hidden="true" />
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m) => (
            <div key={m.id} className="group">
              {m.role === "assistant" ? (
                <div className="flex gap-3">
                  <div className="w-8 h-8 mt-1 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center text-white text-xs flex-shrink-0 rounded-lg">
                    <i className="fa-solid fa-robot" />
                  </div>
                  <div className="max-w-[88%] min-w-0">
                    {/* Tool trace — what the assistant checked to answer */}
                    {m.tools && m.tools.length > 0 && !(m.id === 0) ? (
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {m.tools.map((t, ti) => (
                          <span key={`${t.name}-${ti}`} className="chat-tool-chip" title={t.name}>
                            <i className={`fa-solid ${TOOL_ICONS[t.name] ?? "fa-gear"}`} aria-hidden="true" />
                            {t.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div
                      className={`chat-bubble-ai px-4 py-3 ${
                        m.error ? "border-[var(--redstone)]/40! bg-[var(--redstone)]/5!" : ""
                      }`}
                    >
                      <div className="chat-md text-[15px] leading-relaxed text-[var(--fg-2)]">
                        {renderText(m.text)}
                      </div>
                      {m.error && m.retry ? (
                        <button
                          className="mt-2 text-xs font-semibold text-[var(--redstone)] hover:text-[var(--fg)] transition inline-flex items-center gap-1.5"
                          onClick={() => void send(m.retry)}
                        >
                          <i className="fa-solid fa-rotate-right" />
                          Retry
                        </button>
                      ) : null}
                    </div>
                    {m.stats ? (
                      <div className="text-[10px] text-[var(--muted-2)] mt-0.5 px-1">
                        {m.stats}
                      </div>
                    ) : null}
                    <div className="flex items-center gap-3 mt-1.5 px-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      <span className="text-[11px] text-[var(--muted-2)]">{m.time}</span>
                      <button
                        className="text-[11px] text-[var(--muted)] hover:text-[var(--accent)] transition"
                        onClick={() => void copyMessage(m.text)}
                      >
                        <i className="fa-regular fa-copy mr-1" />
                        Copy
                      </button>
                      {canRegenerate && m.id === lastMsg?.id ? (
                        <button
                          className="text-[11px] text-[var(--muted)] hover:text-[var(--accent)] transition"
                          onClick={regenerate}
                        >
                          <i className="fa-solid fa-rotate-right mr-1" />
                          Regenerate
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 justify-end">
                  <div className="max-w-[88%]">
                    <div className="chat-bubble-user px-4 py-3">
                      <div className="text-[15px] leading-relaxed text-[var(--fg)] whitespace-pre-wrap">
                        {m.text}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-3 mt-1.5 px-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      <span className="text-[11px] text-[var(--muted-2)]">{m.time}</span>
                      <button
                        className="text-[11px] text-[var(--muted)] hover:text-[var(--accent)] transition"
                        onClick={() => void copyMessage(m.text)}
                      >
                        <i className="fa-regular fa-copy mr-1" />
                        Copy
                      </button>
                    </div>
                  </div>
                  <Avatar
                    name={user?.username ?? "You"}
                    src={user?.avatarUrl}
                    size="sm"
                    className="w-8! h-8! mt-1 flex-shrink-0"
                  />
                </div>
              )}
            </div>
          ))}

          {/* Live activity — 3-dot indicator until the first event, then
              real tool chips while the agent works. Hides once the reply
              text itself is streaming (unless tools ran, which keep
              spinning as a "still generating" affordance). */}
          {typing && (dots || activeTools.length > 0) ? (
            <div className="flex gap-3">
              <div className="w-8 h-8 mt-1 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center text-white text-xs flex-shrink-0 rounded-lg">
                <i className="fa-solid fa-robot" />
              </div>
              <div className="chat-bubble-ai px-4 py-3 flex items-center gap-2 flex-wrap">
                {activeTools.length === 0 ? (
                  <>
                    <span className="text-[12px] text-[var(--fg-2)] italic">Thinking</span>
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </>
                ) : (
                  activeTools.map((t, i) => (
                    <span key={`${t.name}-${i}`} className="chat-tool-chip live">
                      <i className={`fa-solid ${TOOL_ICONS[t.name] ?? "fa-gear"} fa-spin`} aria-hidden="true" />
                      {t.label}…
                    </span>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Composer — unified pill container: textarea grows inside, action
          button docked bottom-right. */}
      <div className="flex-shrink-0 border-t border-[var(--border)] p-4 sm:p-5">
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-2)] p-2 transition focus-within:border-[var(--accent)]">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              // isComposing: Enter that CONFIRMS an IME conversion (CJK
              // input) must send nothing — the user is still typing.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={`Ask ${ai.name} anything…`}
            aria-label="Chat message"
            className="flex-1 bg-transparent outline-none resize-none px-3 py-2 text-[15px] leading-relaxed placeholder:text-[var(--muted-2)] max-h-40"
          />
          {typing ? (
            <button
              onClick={stop}
              className="w-10 h-10 mb-0.5 mr-0.5 flex items-center justify-center rounded-xl bg-[var(--redstone)]/15 text-[var(--redstone)] hover:bg-[var(--redstone)]/25 transition flex-shrink-0"
              aria-label="Stop generating"
            >
              <i className="fa-solid fa-stop text-sm" />
            </button>
          ) : (
            <button
              onClick={() => void send()}
              disabled={!input.trim()}
              className="w-10 h-10 mb-0.5 mr-0.5 flex items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent-bright)] transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              aria-label="Send"
            >
              <i className="fa-solid fa-paper-plane text-sm" />
            </button>
          )}
        </div>
        <p className="text-center text-xs text-[var(--muted-2)] mt-2.5">
          {ai.name} can make mistakes ·{" "}
          <span className="hidden sm:inline">
            <kbd className="chat-kbd">/</kbd> to focus · <kbd className="chat-kbd">Shift+Enter</kbd>{" "}
            for a new line
          </span>
        </p>
      </div>
    </div>
  );

  return (
    <div className={`w-full flex flex-col min-h-0 ${embedded ? "" : "flex-1"}`}>
      {/* Header — identity + status + New chat, shared by both variants. */}
      <div className={`${embedded ? "mb-4" : "mb-5"} flex items-center justify-between gap-3 flex-wrap`}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className={`${
                embedded ? "w-10 h-10" : "w-11 h-11"
              } bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center text-white rounded-xl`}
            >
              <i className="fa-solid fa-robot text-lg" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[var(--emerald)] border-2 border-[var(--bg)] rounded-full" />
          </div>
          <div>
            <h1 className={embedded ? "font-display text-lg font-bold" : "font-display text-2xl font-bold"}>
              {ai.name}
            </h1>
            <div className="text-xs text-[var(--emerald)] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-[var(--emerald)] rounded-full" />
              Online · knows the server live
            </div>
          </div>
        </div>
        <button className="btn-ghost py-2! px-3!" onClick={clear} aria-label="New chat">
          <i className="fa-solid fa-rotate-right" />
          <span className="hidden sm:inline">New chat</span>
        </button>
      </div>

      {consoleBody}
    </div>
  );
}

// ------------------------------------------------------------------
// Safe markdown-ish renderer (no dangerouslySetInnerHTML): **bold**,
// `code`, ```fenced blocks``` with a copy button, # headings, lists,
// blockquotes, and [text](https://…) links.
// ------------------------------------------------------------------

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const { show } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      show("Code copied");
    } catch {
      show("Couldn't copy");
    }
  };
  return (
    <div className="chat-codeblock my-2">
      <div className="chat-codeblock-header">
        <span>{lang || "code"}</span>
        <button onClick={() => void copy()} aria-label="Copy code">
          <i className="fa-regular fa-copy" aria-hidden="true" /> Copy
        </button>
      </div>
      <pre className="overflow-x-auto text-[13px] leading-relaxed text-[var(--fg-2)] font-mono p-3 m-0">{code}</pre>
    </div>
  );
}

function renderText(text: string): ReactNode[] {
  // Split on fenced code blocks first so nothing else touches their contents.
  const parts = text.split(/```(\w*)\n?([\s\S]*?)(?:```|$)/g);
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i % 3 === 1) return; // language capture — used below
    if (i % 3 === 2) {
      const lang = parts[i - 1];
      out.push(<CodeBlock key={`code-${i}`} code={part.replace(/\n$/, "")} lang={lang || undefined} />);
      return;
    }
    out.push(...renderBlocks(part, `b-${i}`));
  });
  return out;
}

function renderBlocks(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(/\n{2,}/)
    .filter((b) => b.trim().length > 0)
    .map((block, bi) => {
      const lines = block.split("\n");

      // Heading — # / ## / ###
      const heading = block.match(/^(#{1,3})\s+(.*)$/);
      if (heading && lines.length === 1) {
        const level = heading[1].length;
        const cls =
          level === 1
            ? "font-display text-lg font-bold"
            : level === 2
              ? "font-display text-base font-bold"
              : "font-semibold";
        return (
          <div key={`${keyPrefix}-h-${bi}`} className={`${cls} text-[var(--fg)] mt-2 mb-1`}>
            {inlineFormat(heading[2])}
          </div>
        );
      }

      // List — consecutive "- " / "• " lines
      if (lines.every((l) => /^\s*[-•]\s+/.test(l) || l.trim() === "")) {
        const items = lines.filter((l) => /^\s*[-•]\s+/.test(l));
        if (items.length > 0) {
          return (
            <ul key={`${keyPrefix}-ul-${bi}`} className="list-none space-y-1 my-2">
              {items.map((li, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[var(--accent)] mt-[3px] text-xs">▸</span>
                  <span>{inlineFormat(li.replace(/^\s*[-•]\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }
      }

      // Blockquote — "> " lines
      if (lines.every((l) => /^\s*>\s?/.test(l) || l.trim() === "")) {
        return (
          <blockquote
            key={`${keyPrefix}-q-${bi}`}
            className="border-l-2 border-[var(--accent)]/50 pl-3 my-2 text-[var(--muted)]"
          >
            {lines.map((l, i) => (
              <div key={i}>{inlineFormat(l.replace(/^\s*>\s?/, ""))}</div>
            ))}
          </blockquote>
        );
      }

      // Paragraph(s)
      return (
        <div key={`${keyPrefix}-p-${bi}`}>
          {lines.map((line, i) => (
            <p key={i} className="my-1">
              {line.trim() ? inlineFormat(line) : <br />}
            </p>
          ))}
        </div>
      );
    });
}

function inlineFormat(line: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Tokenize: `code` | **bold** | [text](url) — code first so links inside
  // code stay literal.
  const parts = line.split(/(`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      nodes.push(
        <code
          key={i}
          className="bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[13px] font-mono text-[var(--accent-bright)]"
        >
          {part.slice(1, -1)}
        </code>
      );
      return;
    }
    const linkParts = part.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
    linkParts.forEach((lp, j) => {
      const link = lp.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (link) {
        nodes.push(
          <a
            key={`${i}-${j}`}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-bright)] underline decoration-[var(--accent)]/40 hover:decoration-[var(--accent)] break-words"
          >
            {link[1]}
          </a>
        );
        return;
      }
      const boldParts = lp.split(/(\*\*[^*]+\*\*)/g);
      boldParts.forEach((bp, k) => {
        if (bp.startsWith("**") && bp.endsWith("**") && bp.length > 4) {
          nodes.push(
            <strong key={`${i}-${j}-${k}`} className="font-semibold text-[var(--fg)]">
              {bp.slice(2, -2)}
            </strong>
          );
        } else if (bp) {
          nodes.push(<span key={`${i}-${j}-${k}`}>{bp}</span>);
        }
      });
    });
  });
  return nodes;
}
