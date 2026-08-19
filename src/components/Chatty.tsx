"use client";

// Chatty Jr. — the site's chat widget. Two variants:
//   - "full":     the standalone assistant page (own header, tall chat)
//   - "embedded": a compact card you can drop on any page (e.g. /join)
// Streams replies as they generate; keeps history in localStorage; the
// 3-dot indicator is the only "thinking" ever shown.

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { siteConfig } from "@/lib/site";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/Toast";
import { useSession } from "@/lib/use-session";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  time: string;
}

const SUGGESTIONS = [
  { icon: "fa-gavel", label: "What are the server rules?", text: "What are the server rules?" },
  { icon: "fa-users", label: "Who are the members?", text: "Who are the members?" },
  { icon: "fa-compass", label: "How do I join?", text: "How do I join?" },
  { icon: "fa-cube", label: "What version is the server?", text: "What version is the server?" },
];

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
  // Chatty Jr. is a member perk: sign in with Discord and hold the
  // `ai_access` permission (admins always have it).
  const hasAccess =
    user !== null && (user.role === "admin" || user.permissions.includes("ai_access"));

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: "assistant",
      text: `Hey — I'm ${ai.name}, ${siteConfig.name}'s assistant. Ask me about the server, rules, members, or how to join.`,
      time: nowTime(),
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [dots, setDots] = useState(false); // 3-dot indicator while waiting for the first word
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);
  const genRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const autoAsked = useRef(false);

  // Load persisted history once, after mount — the initializer above must
  // NOT read localStorage, or SSR and client render different first frames
  // (hydration mismatch).
  useEffect(() => {
    const history = loadHistory();
    if (history && history.length > 0) {
      setMessages(history);
      nextId.current = Math.max(...history.map((m) => m.id), 0) + 1;
    }
    setHydrated(true);
  }, []);

  // Persist history — but only once hydrated, so the welcome state never
  // overwrites saved chats.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages, hydrated]);

  // Keep the newest message in view — no scrolling the page to read it.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  // Auto-ask a prefill question when navigated to with ?ask=... — only
  // after history has loaded, only if the chat is still the welcome state,
  // and only for members with AI access.
  useEffect(() => {
    if (!hydrated || autoAsked.current) return;
    if (messages.length > 1) return; // already has a real conversation
    if (!hasAccess) return;
    const params = new URLSearchParams(window.location.search);
    const ask = params.get("ask");
    if (ask) {
      autoAsked.current = true;
      void send(ask);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, messages.length, hasAccess]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || typing) return;
    const gen = ++genRef.current; // invalidates any in-flight request
    const controller = new AbortController();
    controllerRef.current = controller;

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

    // Appends/updates the streaming assistant bubble.
    let assistantId: number | null = null;
    const updateAssistant = (partial: string) => {
      if (assistantId === null) {
        const id = nextId.current++;
        assistantId = id;
        setMessages((m) => [
          ...m,
          { id, role: "assistant", text: partial, time: nowTime() },
        ]);
      } else {
        setMessages((m) =>
          m.map((msg) => (msg.id === assistantId ? { ...msg, text: partial } : msg))
        );
      }
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
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
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (gen !== genRef.current) {
          controller.abort(); // stopped or superseded
          return;
        }
        acc += decoder.decode(value, { stream: true });
        if (acc.trim()) {
          setDots(false); // first word arrived — drop the 3-dot indicator
          updateAssistant(acc);
        }
      }
      if (gen !== genRef.current) return;
      updateAssistant(acc.trim() || "Hmm, I didn't quite catch that — could you rephrase?");
    } catch {
      if (gen !== genRef.current) return; // stopped — keep partial text
      updateAssistant("That's a good question for the server team. Check the Forum or Rules.");
    } finally {
      if (gen === genRef.current) {
        setTyping(false);
        setDots(false);
      }
      controllerRef.current = null;
    }
  };

  const stop = () => {
    genRef.current++; // invalidate the in-flight request
    controllerRef.current?.abort();
    setTyping(false);
    setDots(false);
  };

  const clear = () => {
    genRef.current++;
    controllerRef.current?.abort();
    setTyping(false);
    setDots(false);
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

  const isEmpty = messages.length <= 1 && messages[0]?.role === "assistant";

  return (
    <div className={`w-full flex flex-col min-h-0 ${embedded ? "" : "flex-1"}`}>
      {/* Header — title + status + new chat */}
      <div className={`${embedded ? "mb-4" : "mb-6"} flex items-center justify-between gap-3 flex-wrap`}>
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
            <h1 className={embedded ? "font-display text-lg font-bold" : "page-title !text-3xl md:!text-4xl"}>
              {ai.name}
            </h1>
            <div className="text-xs text-[var(--emerald)] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-[var(--emerald)] rounded-full" />
              Online · {siteConfig.name}
            </div>
          </div>
        </div>
        <button className="btn-ghost py-2! px-3!" onClick={clear} aria-label="New chat">
          <i className="fa-solid fa-rotate-right" />
          <span className="hidden sm:inline">New chat</span>
        </button>
      </div>

      {/* Chat card — member perk: sign-in + ai_access required */}
      {sessionLoading ? (
        <div className="card p-8 text-center min-h-[26rem] flex items-center justify-center">
          <p className="text-sm text-[var(--muted)]">Checking session…</p>
        </div>
      ) : !user ? (
        <div className="card p-8 text-center flex flex-col items-center justify-center min-h-[26rem]">
          <div className="w-14 h-14 rounded-2xl bg-[#5865F2] text-white flex items-center justify-center text-2xl mb-4 shadow-[0_10px_30px_-10px_rgba(88,101,242,0.7)]">
            <i className="fa-brands fa-discord" />
          </div>
          <h2 className="font-display text-xl font-bold mb-2">Sign in to chat with {ai.name}</h2>
          <p className="text-sm text-[var(--muted)] mb-6 max-w-sm">
            Chatty Jr. is a member perk — log in with Discord to start chatting.
          </p>
          <Link href="/login" className="btn-primary justify-center">
            <i className="fa-brands fa-discord" />
            Log in with Discord
          </Link>
        </div>
      ) : !hasAccess ? (
        <div className="card p-8 text-center flex flex-col items-center justify-center min-h-[26rem]">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent-dim)] border border-[var(--border-strong)] text-[var(--accent)] flex items-center justify-center text-2xl mb-4">
            <i className="fa-solid fa-lock" />
          </div>
          <h2 className="font-display text-xl font-bold mb-2">No AI access yet</h2>
          <p className="text-sm text-[var(--muted)] max-w-sm">
            Your account doesn&apos;t have the AI permission yet — ask an admin to grant it in the
            Manage Panel.
          </p>
        </div>
      ) : (
      <div
        className={`card flex flex-col overflow-hidden ${
          embedded
            ? "h-[26rem]"
            : "h-[calc(100dvh-12rem)] lg:h-[calc(100dvh-14rem)] min-h-[26rem]"
        }`}
      >
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto" id="chat-messages">
          <div className="px-4 sm:px-6 py-6 space-y-5">
            {messages.map((m) => (
              <div key={m.id} className="group">
                {m.role === "assistant" ? (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 mt-1 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center text-white text-xs flex-shrink-0 rounded-lg">
                      <i className="fa-solid fa-robot" />
                    </div>
                    <div className="max-w-[88%]">
                      <div className="chat-bubble-ai px-4 py-3">
                        <div className="text-[15px] leading-relaxed text-[var(--fg-2)]">
                          {renderText(m.text)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                  </div>
                ) : (
                  <div className="flex gap-3 justify-end">
                    <div className="max-w-[88%]">
                      <div className="chat-bubble-user px-4 py-3">
                        <div className="text-[15px] leading-relaxed text-[var(--fg)] whitespace-pre-wrap">
                          {m.text}
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-3 mt-1.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                      className="!w-8 !h-8 mt-1 flex-shrink-0"
                    />
                  </div>
                )}
              </div>
            ))}

            {/* 3-dot typing indicator — the only "thinking" shown */}
            {dots ? (
              <div className="flex gap-3">
                <div className="w-8 h-8 mt-1 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center text-white text-xs flex-shrink-0 rounded-lg">
                  <i className="fa-solid fa-robot" />
                </div>
                <div className="chat-bubble-ai px-4 py-3 flex items-center gap-1.5">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Welcome suggestions — only when fresh */}
        {isEmpty && !typing ? (
          <div className="flex-shrink-0 px-4 sm:px-6 pb-5">
            <div className="grid sm:grid-cols-2 gap-2.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  className="card px-4 py-3.5 flex items-center gap-3 text-left hover:border-[var(--accent)] transition"
                  onClick={() => void send(s.text)}
                >
                  <i className={`fa-solid ${s.icon} text-[var(--accent)] text-sm`} />
                  <span className="text-sm text-[var(--fg-2)]">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Input bar */}
        <div className="flex-shrink-0 border-t border-[var(--border)] px-4 sm:px-6 py-4">
          <div className="flex items-end gap-2.5">
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
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={`Ask ${ai.name} anything…`}
              className="flex-1 bg-[var(--bg-2)] border border-[var(--border)] rounded-xl px-4 py-3 outline-none resize-none text-[15px] leading-relaxed placeholder:text-[var(--muted-2)] max-h-40 transition focus:border-[var(--accent)]"
            />
            {typing ? (
              <button
                onClick={stop}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-[var(--redstone)]/15 text-[var(--redstone)] hover:bg-[var(--redstone)]/25 transition flex-shrink-0"
                aria-label="Stop generating"
              >
                <i className="fa-solid fa-stop text-sm" />
              </button>
            ) : (
              <button
                onClick={() => void send()}
                disabled={!input.trim()}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent-bright)] transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                aria-label="Send"
              >
                <i className="fa-solid fa-paper-plane text-sm" />
              </button>
            )}
          </div>
          <p className="text-center text-xs text-[var(--muted-2)] mt-2.5">
            {ai.name} can make mistakes — double-check important info.
          </p>
        </div>
      </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Tiny safe formatter: renders **bold**, `code`, ```blocks```, lists,
// and paragraph breaks as React nodes (no dangerouslySetInnerHTML).
// ------------------------------------------------------------------
function renderText(text: string): ReactNode[] {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block, bi) => {
    // Code block — strip the opening fence (``` or ```lang) and closing ```.
    if (block.trimStart().startsWith("```")) {
      const lines = block.trim().split("\n");
      const body = lines.filter((_, i) => i > 0 && i < lines.length - 1).join("\n");
      return (
        <pre
          key={bi}
          className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 my-2 overflow-x-auto text-[13px] leading-relaxed text-[var(--fg-2)] font-mono"
        >
          {body}
        </pre>
      );
    }

    const lines = block.split("\n");
    const listItems: string[] = [];
    const out: ReactNode[] = [];

    const flushList = (key: number) => {
      if (listItems.length === 0) return;
      out.push(
        <ul key={`ul-${key}`} className="list-none space-y-1 my-2">
          {listItems.map((li, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-[var(--accent)] mt-1.5">▸</span>
              <span>{inlineFormat(li)}</span>
            </li>
          ))}
        </ul>
      );
      listItems.length = 0;
    };

    lines.forEach((line, i) => {
      if (/^\s*[-•]\s+/.test(line)) {
        listItems.push(line.replace(/^\s*[-•]\s+/, ""));
      } else {
        flushList(i);
        out.push(
          <p key={`p-${i}`} className="my-1">
            {inlineFormat(line)}
          </p>
        );
      }
    });
    flushList(9999 + bi);

    return <div key={`b-${bi}`}>{out}</div>;
  });
}

function inlineFormat(line: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split by `code` first, then handle **bold** inside non-code parts.
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
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    boldParts.forEach((bp, j) => {
      if (bp.startsWith("**") && bp.endsWith("**") && bp.length > 4) {
        nodes.push(
          <strong key={`${i}-${j}`} className="font-semibold text-[var(--fg)]">
            {bp.slice(2, -2)}
          </strong>
        );
      } else if (bp) {
        nodes.push(<span key={`${i}-${j}`}>{bp}</span>);
      }
    });
  });
  return nodes;
}
