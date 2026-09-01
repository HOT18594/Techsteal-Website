"use client";

// Chatty Jr. — the site's AI assistant, now a tool-using agent.
// Rendered as the standalone assistant page: a two-pane app with an
// identity/capability/prompt sidebar rail beside a focused chat console.
// The backend streams NDJSON events: text chunks plus live tool activity
// ("Checking live status…") which render as chips on the reply. History
// lives in localStorage; the 3-dot indicator only shows before the first
// event arrives.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { siteConfig } from "@/lib/site";
import { Avatar } from "@/components/Avatar";
import { Markdown } from "@/components/Markdown";
import { useToast } from "@/components/Toast";
import { useSession } from "@/lib/use-session";
import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  isChatModelId,
  type ChatModelId,
} from "@/lib/chat-models";

interface ToolTrace {
  id: string;
  name: string;
  label: string;
  status: "running" | "complete" | "error";
  durationMs?: number;
}

/** NDJSON events the chat API streams (one JSON object per line). */
interface StreamEvent {
  t?: string;
  v?: string;
  name?: string;
  label?: string;
  id?: string;
  phase?: "start" | "done";
  ok?: string;
  ms?: string;
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
  search_mods: "fa-puzzle-piece",
  search_site: "fa-magnifying-glass",
  web_search: "fa-globe",
};

const STORAGE_KEY = "techsteal-nova-chat-v1";
const PREFERENCES_KEY = "techsteal-chatty-preferences-v1";

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

function ChattyLogo({ size, className = "" }: { size: number; className?: string }) {
  return (
    <Image
      src="/chatty-jr-logo.png"
      alt=""
      width={size}
      height={size}
      className={`chatty-logo-image ${className}`}
    />
  );
}

export function Chatty() {
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
  const [streamStarted, setStreamStarted] = useState(false);
  const [activeTools, setActiveTools] = useState<ToolTrace[]>([]); // tools used by the reply in flight
  const [hydrated, setHydrated] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ChatModelId>(DEFAULT_CHAT_MODEL);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
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
    try {
      const rawPreferences = localStorage.getItem(PREFERENCES_KEY);
      if (rawPreferences) {
        const preferences = JSON.parse(rawPreferences) as {
          model?: unknown;
          webSearchEnabled?: unknown;
        };
        if (isChatModelId(preferences.model)) setSelectedModel(preferences.model);
        if (typeof preferences.webSearchEnabled === "boolean") {
          setWebSearchEnabled(preferences.webSearchEnabled);
        }
      }
    } catch {
      // Keep the suggested defaults if stored preferences are malformed.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        PREFERENCES_KEY,
        JSON.stringify({ model: selectedModel, webSearchEnabled })
      );
    } catch {}
  }, [hydrated, selectedModel, webSearchEnabled]);

  // Persist history — throttled. Streaming fires dozens of setMessages per
  // second; a stringify-plus-localStorage write on every token janks the
  // main thread (worst on mobile). Saves trail ~600ms behind the last
  // update and flush immediately when the tab hides or the component
  // unmounts, so nothing is lost if the user leaves mid-stream.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const hydratedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!hydratedRef.current) return; // never clobber saved chats pre-hydration
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messagesRef.current.slice(-50)));
    } catch {}
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    hydratedRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 600);
  }, [messages, hydrated, flushSave]);
  useEffect(() => {
    const onHide = () => flushSave();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flushSave();
    };
  }, [flushSave]);

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
    setStreamStarted(false);
    activeToolsRef.current = [];
    setActiveTools([]);

    // Prior turns give the model context for follow-ups ("what about
    // rule 3?"). Skip the welcome message (id 0), failed exchanges (their
    // error text is noise that degrades follow-up answers), and cap/truncate
    // lightly.
    const priorTurns = basis
      .filter((m) => m.id !== 0 && !m.error && m.text.trim().length > 0)
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
        body: JSON.stringify({
          message: text,
          history: priorTurns,
          model: selectedModel,
          webSearchEnabled,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        // 401/403/429 are access/rate gates the server explains in its body —
        // show that as a friendly reply. Any other status is a REAL failure:
        // mark it as an error bubble with Retry instead of dressing it up as
        // an AI answer.
        const gateText = await res.text().catch(() => "");
        if (gen !== genRef.current) return;
        setDots(false);
        const gate = res.status === 401 || res.status === 403 || res.status === 429;
        updateAssistant(
          gateText.trim() || "Hmm, something went wrong — check your access and try again.",
          !gate,
          gate ? undefined : text
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
          setStreamStarted(true);
          acc += ev.v;
          chars += ev.v.length;
          const now2 = Date.now();
          if (lastTextAt !== null) {
            genMs += Math.min(now2 - lastTextAt, TEXT_GAP_CAP_MS);
          }
          lastTextAt = now2;
          updateAssistant(acc);
        } else if (ev && ev.t === "tool" && ev.name) {
          const traceId = ev.id ?? `${ev.name}-${activeToolsRef.current.length}`;
          const existing = activeToolsRef.current.findIndex((tool) => tool.id === traceId);
          const status: ToolTrace["status"] =
            ev.phase === "done" ? (ev.ok === "false" ? "error" : "complete") : "running";
          const trace: ToolTrace = {
            id: traceId,
            name: ev.name,
            label: ev.label ?? "Working…",
            status,
            durationMs: ev.ms ? Number(ev.ms) : undefined,
          };
          activeToolsRef.current =
            existing >= 0
              ? activeToolsRef.current.map((tool, index) => (index === existing ? trace : tool))
              : [...activeToolsRef.current, trace];
          setActiveTools(activeToolsRef.current);
          setDots(false); // real activity to show instead of dots
          if (assistantId !== null) updateAssistant(acc);
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
      // Aborted streams (Stop button, unmount, superseded by a newer send)
      // are not failures — keep any partial text and stay quiet. React also
      // drops setState-after-unmount, but classifying it as a connection
      // error was simply wrong.
      if (gen !== genRef.current || controller.signal.aborted) return;
      // A failed request must NOT look like an AI answer — mark the bubble
      // as an error and offer to re-send the question.
      updateAssistant("Something went wrong reaching me — check your connection.", true, text);
    } finally {
      if (gen === genRef.current) {
        setTyping(false);
        setDots(false);
        setStreamStarted(false);
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
    setStreamStarted(false);
    setActiveTools([]);
  };

  const clear = () => {
    genRef.current++;
    controllerRef.current?.abort();
    setTyping(false);
    setDots(false);
    setStreamStarted(false);
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
      show("Couldn't copy", "Your browser blocked clipboard access.", "error");
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
    !typing && lastMsg?.role === "assistant" && !lastMsg?.error && messages.length > 1;
  const selectedModelOption =
    CHAT_MODELS.find((model) => model.id === selectedModel) ?? CHAT_MODELS[0];

  const gateClass = "assistant-gate";

  const consoleBody = sessionLoading ? (
    <div className={gateClass}>
      <div className="assistant-gate-icon is-loading"><i className="fa-solid fa-circle-notch fa-spin" /></div>
      <h2>Preparing your assistant</h2>
      <p>Connecting your account and Techsteal knowledge…</p>
    </div>
  ) : !user ? (
    <div className={gateClass}>
      <div className="assistant-gate-icon is-discord"><i className="fa-brands fa-discord" /></div>
      <p className="assistant-eyebrow">Member access</p>
      <h2>Sign in to chat with {ai.name}</h2>
      <p>{ai.name} is included for Techsteal members. Log in with Discord to open your conversation.</p>
      <Link href="/login" className="btn-primary justify-center">
        <i className="fa-brands fa-discord" />
        Log in with Discord
      </Link>
    </div>
  ) : !hasAccess ? (
    <div className={gateClass}>
      <div className="assistant-gate-icon"><i className="fa-solid fa-shield-halved" /></div>
      <p className="assistant-eyebrow">One step left</p>
      <h2>Verify your membership</h2>
      <p>Verify that you&apos;re in the official Discord to unlock the assistant, Gallery posting, and Server Control.</p>
      <Link href="/settings" className="btn-primary justify-center">
        <i className="fa-solid fa-user-check" />
        Verify in Settings
      </Link>
    </div>
  ) : (
    <div className="assistant-chat-frame">
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="assistant-chat-scroll"
        id="chat-messages"
      >
        <div className="assistant-thread" role="log" aria-live="polite" aria-relevant="additions text">
          {isEmpty && !typing ? (
            <div className="assistant-welcome">
              <div className="assistant-welcome-mark" aria-hidden="true">
                <ChattyLogo size={72} />
                <span />
              </div>
              <p className="assistant-eyebrow">Your Techsteal copilot</p>
              <h2>What can I help you find{user?.username ? `, ${user.username}` : ""}?</h2>
              <p className="assistant-welcome-copy">
                Ask about the live server, community activity, rules, builds, mods, or Minecraft itself.
                I&apos;ll pull in the right source while you watch.
              </p>
              <div className="assistant-prompt-grid">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.title}
                    type="button"
                    onClick={() => void send(suggestion.text)}
                    disabled={typing}
                  >
                    <i className={`fa-solid ${suggestion.icon}`} aria-hidden="true" />
                    <span>
                      <strong>{suggestion.title}</strong>
                      <small>{suggestion.hint}</small>
                    </span>
                    <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                  </button>
                ))}
              </div>
              <div className="assistant-trust-row" aria-label="Assistant capabilities">
                <span><i className="fa-solid fa-bolt" /> Live answers</span>
                <span><i className="fa-solid fa-database" /> Site knowledge</span>
                <span>
                  <i className={`fa-solid ${webSearchEnabled ? "fa-globe" : "fa-shield-halved"}`} />
                  {webSearchEnabled ? "Web search on" : "Web search off"}
                </span>
              </div>
            </div>
          ) : null}

          {!isEmpty
            ? messages.map((messageItem) => (
                <article
                  key={messageItem.id}
                  className={`assistant-message ${
                    messageItem.role === "assistant" ? "is-assistant" : "is-user"
                  }`}
                >
                  {messageItem.role === "assistant" ? (
                    <>
                      <div className="assistant-message-avatar" aria-hidden="true">
                        <ChattyLogo size={36} />
                      </div>
                      <div className="assistant-message-main">
                        <div className="assistant-message-meta">
                          <strong>{ai.name}</strong>
                          <span>{messageItem.time}</span>
                        </div>
                        {messageItem.tools && messageItem.tools.length > 0 && messageItem.id !== 0 ? (
                          <div className="assistant-tool-trace" aria-label="Sources checked">
                            {messageItem.tools.map((tool, toolIndex) => {
                              const status = tool.status ?? "complete";
                              return (
                                <span
                                  key={tool.id ?? `${tool.name}-${toolIndex}`}
                                  className={`is-${status}`}
                                  title={tool.name}
                                >
                                  <i
                                    className={`fa-solid ${
                                      status === "running"
                                        ? "fa-circle-notch fa-spin"
                                        : status === "error"
                                          ? "fa-triangle-exclamation"
                                          : "fa-check"
                                    }`}
                                    aria-hidden="true"
                                  />
                                  {tool.label}
                                  {tool.durationMs ? <small>{(tool.durationMs / 1000).toFixed(1)}s</small> : null}
                                </span>
                              );
                            })}
                          </div>
                        ) : null}
                        <div className={`assistant-answer ${messageItem.error ? "is-error" : ""}`}>
                          <div className="chat-md">{renderText(messageItem.text)}</div>
                          {messageItem.error && messageItem.retry ? (
                            <button
                              className="assistant-retry"
                              onClick={
                                messageItem.id === lastMsg?.id
                                  ? regenerate
                                  : () => void send(messageItem.retry)
                              }
                            >
                              <i className="fa-solid fa-rotate-right" /> Retry
                            </button>
                          ) : null}
                        </div>
                        <div className="assistant-message-actions">
                          {messageItem.stats ? <span>{messageItem.stats}</span> : <span />}
                          <button onClick={() => void copyMessage(messageItem.text)}>
                            <i className="fa-regular fa-copy" /> Copy
                          </button>
                          {canRegenerate && messageItem.id === lastMsg?.id ? (
                            <button onClick={regenerate}>
                              <i className="fa-solid fa-rotate-right" /> Regenerate
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="assistant-message-main">
                        <div className="assistant-message-meta is-user-meta">
                          <span>{messageItem.time}</span>
                          <strong>You</strong>
                        </div>
                        <div className="assistant-user-bubble">{messageItem.text}</div>
                        <div className="assistant-message-actions is-user-actions">
                          <button onClick={() => void copyMessage(messageItem.text)}>
                            <i className="fa-regular fa-copy" /> Copy
                          </button>
                        </div>
                      </div>
                      <Avatar
                        name={user?.username ?? "You"}
                        src={user?.avatarUrl}
                        size="sm"
                        className="assistant-user-avatar w-9! h-9! flex-shrink-0"
                      />
                    </>
                  )}
                </article>
              ))
            : null}

          {typing && !streamStarted ? (
            <article className="assistant-message is-assistant">
              <div className="assistant-message-avatar" aria-hidden="true">
                <ChattyLogo size={36} />
              </div>
              <div className="assistant-message-main">
                <div className="assistant-message-meta"><strong>{ai.name}</strong><span>Working now</span></div>
                <div className="assistant-thinking-card">
                  {dots && activeTools.length === 0 ? (
                    <div className="assistant-thinking-label">
                      <span>Thinking</span>
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  ) : (
                    <div className="assistant-live-tools">
                      {activeTools.map((tool, index) => (
                        <div key={tool.id ?? `${tool.name}-${index}`} className={`is-${tool.status ?? "running"}`}>
                          <i
                            className={`fa-solid ${
                              tool.status === "complete"
                                ? "fa-check"
                                : tool.status === "error"
                                  ? "fa-triangle-exclamation"
                                  : `${TOOL_ICONS[tool.name] ?? "fa-gear"} fa-spin`
                            }`}
                            aria-hidden="true"
                          />
                          <span>{tool.label}</span>
                          {tool.durationMs ? <small>{(tool.durationMs / 1000).toFixed(1)}s</small> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ) : null}
        </div>
      </div>

      <div className="assistant-composer-area">
        <div className="assistant-composer">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={2000}
            onChange={(event) => {
              setInput(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={`Message ${ai.name}…`}
            aria-label="Chat message"
          />
          <div className="assistant-composer-footer">
            <div className="assistant-composer-context">
              <span>
                <i className={`fa-solid ${webSearchEnabled ? "fa-globe" : "fa-database"}`} />
                {webSearchEnabled ? "Web search on" : "Site tools only"}
              </span>
              <span className="assistant-composer-model">
                <i className="fa-solid fa-bolt" /> {selectedModelOption.label}
              </span>
              {input.length > 1600 ? <small>{input.length}/2000</small> : null}
            </div>
            {typing ? (
              <button type="button" onClick={stop} className="assistant-send is-stop" aria-label="Stop generating">
                <i className="fa-solid fa-stop" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void send()}
                disabled={!input.trim()}
                className="assistant-send"
                aria-label="Send message"
              >
                <i className="fa-solid fa-arrow-up" />
              </button>
            )}
          </div>
        </div>
        <p className="assistant-composer-caption">
          {ai.name} can make mistakes. Check important info. <span><kbd>/</kbd> focus · <kbd>Shift+Enter</kbd> new line</span>
        </p>
      </div>
    </div>
  );

  return (
    <div className="assistant-workspace">
      <aside className="assistant-rail">
        <div className="assistant-rail-brand">
          <div className="assistant-orb" aria-hidden="true">
            <ChattyLogo size={46} />
            <span />
          </div>
          <div>
            <p className="assistant-eyebrow">Techsteal intelligence</p>
            <h1>{ai.name}</h1>
            <p>Server-aware help, in one place.</p>
          </div>
        </div>

        <div className="assistant-presence">
          <span className="assistant-presence-dot" aria-hidden="true" />
          <div>
            <strong>Connected to Techsteal</strong>
            <span>Live site knowledge available</span>
          </div>
        </div>

        <div className="assistant-rail-section">
          <div className="assistant-rail-heading">
            <span>Quick starts</span>
            <i className="fa-solid fa-bolt" aria-hidden="true" />
          </div>
          <div className="assistant-quick-list">
            {SUGGESTIONS.slice(0, 5).map((suggestion) => (
              <button
                key={suggestion.title}
                type="button"
                onClick={() => void send(suggestion.text)}
                disabled={typing || !hasAccess}
              >
                <i className={`fa-solid ${suggestion.icon}`} aria-hidden="true" />
                <span>
                  <strong>{suggestion.title}</strong>
                  <small>{suggestion.hint}</small>
                </span>
                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>

        <div className="assistant-rail-note">
          <i className="fa-solid fa-shield-halved" aria-hidden="true" />
          <p>
            <strong>Safe, read-only access</strong>
            <span>Chatty can look things up, but never changes your account or server.</span>
          </p>
        </div>
      </aside>

      <section className="assistant-console">
        <div className="assistant-console-bar">
          <div className="assistant-console-title">
            <div className="assistant-mobile-orb" aria-hidden="true">
              <ChattyLogo size={32} />
            </div>
            <div>
              <p>Current conversation</p>
              <strong>{ai.name}</strong>
            </div>
          </div>
          <div className="assistant-console-actions">
            <label className="assistant-model-picker">
              <i className="fa-solid fa-microchip" aria-hidden="true" />
              <span className="sr-only">Assistant model</span>
              <select
                value={selectedModel}
                onChange={(event) => {
                  if (isChatModelId(event.target.value)) setSelectedModel(event.target.value);
                }}
                disabled={typing}
                aria-label="Assistant model"
              >
                {CHAT_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}{model.suggested ? " · Suggested" : ""}
                  </option>
                ))}
              </select>
              <i className="fa-solid fa-chevron-down" aria-hidden="true" />
            </label>
            <button
              type="button"
              className={`assistant-search-toggle ${webSearchEnabled ? "is-on" : ""}`}
              onClick={() => setWebSearchEnabled((enabled) => !enabled)}
              disabled={typing}
              aria-pressed={webSearchEnabled}
              aria-label={`Web search ${webSearchEnabled ? "on" : "off"}`}
              title="Allow Chatty Jr. to search public web sources"
            >
              <i className="fa-solid fa-globe" aria-hidden="true" />
              <span>Web search</span>
              <em>{webSearchEnabled ? "On" : "Off"}</em>
              <span className="assistant-toggle-track" aria-hidden="true"><span /></span>
            </button>
            <button className="assistant-new-chat" onClick={clear} aria-label="Start a new chat">
              <i className="fa-solid fa-plus" />
              <span>New chat</span>
            </button>
          </div>
        </div>

        {consoleBody}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------
// Fenced code blocks in AI replies keep a Copy button — otherwise the
// shared <Markdown> renderer (components/Markdown.tsx) does the work.
// This file used to carry its own renderText/renderBlocks/inlineFormat
// trio, which drifted: it never supported italics, strikethrough,
// spoilers, images, numbered lists, horizontal rules or bare-URL
// autolinking, and it rendered EVERY line of a paragraph as its own <p>.
// ------------------------------------------------------------------

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const { show } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      show("Code copied");
    } catch {
      show("Couldn't copy", "Your browser blocked clipboard access.", "error");
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

function renderText(text: string) {
  // `md-body` carries the block spacing/typography the renderer's classes
  // expect; `chat-md` only trims the first/last child margins so a bubble
  // doesn't gain padding it wasn't designed for.
  return <Markdown text={text} className="md-body chat-md" codeBlock={CodeBlock} />;
}
