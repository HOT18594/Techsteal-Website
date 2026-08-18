"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { siteConfig } from "@/lib/site";
import { useToast } from "@/components/Toast";

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

export default function AssistantPage() {
  const { show } = useToast();
  const ai = siteConfig.assistant;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const history = loadHistory();
    if (history && history.length > 0) return history;
    return [
      {
        id: 0,
        role: "assistant",
        text: `Hey — I'm ${ai.name}, ${siteConfig.name}'s assistant. Ask me about the server, rules, members, or how to join.`,
        time: nowTime(),
      },
    ];
  });
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);
  const cancelRef = useRef(false);
  const autoAsked = useRef(false);

  // Persist history (but never the empty welcome state).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  // Auto-ask a prefill question when navigated to with ?ask=... — only if
  // the chat is still the default welcome state.
  useEffect(() => {
    if (autoAsked.current) return;
    if (messages.length > 1) return; // already has a real conversation
    const params = new URLSearchParams(window.location.search);
    const ask = params.get("ask");
    if (ask) {
      autoAsked.current = true;
      void send(ask);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || typing) return;
    cancelRef.current = false;
    setMessages((m) => [
      ...m,
      { id: nextId.current++, role: "user", text, time: nowTime() },
    ]);
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setTyping(true);
    try {
      let reply = "That's a good question for the server team. Check the Forum or Rules.";
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        if (res.ok) {
          const data = (await res.json()) as { reply?: string };
          reply = data.reply ?? reply;
        }
      } catch {
        /* static export / no backend — use local reply */
      }
      if (cancelRef.current) return; // user hit stop
      setMessages((m) => [
        ...m,
        { id: nextId.current++, role: "assistant", text: reply, time: nowTime() },
      ]);
    } finally {
      setTyping(false);
    }
  };

  const stop = () => {
    cancelRef.current = true;
    setTyping(false);
  };

  const clear = () => {
    cancelRef.current = true;
    setTyping(false);
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
    <section className="flex-1 min-h-0 flex flex-col">
      {/* Invisible top spacer — clears the floating wordmark/buttons */}
      <div aria-hidden="true" className="h-20 lg:h-24 flex-shrink-0" />

      {/* Header */}
      <header className="flex-shrink-0 w-full max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white rounded-xl shadow-[0_0_20px_-6px_var(--accent-glow)]">
              {ai.initial}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[var(--emerald)] border-2 border-[var(--bg)] rounded-full" />
          </div>
          <div>
            <div className="font-display font-bold text-xl leading-tight">{ai.name}</div>
            <div className="text-xs text-[var(--emerald)] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-[var(--emerald)] rounded-full" />
              Online · {siteConfig.name}
            </div>
          </div>
        </div>
        <button
          className="text-[var(--muted)] hover:text-[var(--accent)] transition flex items-center gap-2 text-sm"
          onClick={clear}
          aria-label="New chat"
        >
          <i className="fa-solid fa-rotate-right" />
          <span className="hidden sm:inline">New chat</span>
        </button>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto" id="chat-messages">
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {messages.map((m) => (
            <div key={m.id} className="group">
              {m.role === "assistant" ? (
                <div className="flex gap-3">
                  <div className="w-8 h-8 mt-1 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white text-xs flex-shrink-0 rounded-lg">
                    {ai.initial}
                  </div>
                  <div className="max-w-[88%]">
                    <div className="chat-bubble-ai px-5 py-4">
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
                    <div className="chat-bubble-user px-5 py-4">
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
                  <div className="w-8 h-8 mt-1 bg-[var(--accent)] flex items-center justify-center font-display font-bold text-white text-xs flex-shrink-0 rounded-lg">
                    YOU
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {typing ? (
            <div className="flex gap-3">
              <div className="w-8 h-8 mt-1 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white text-xs flex-shrink-0 rounded-lg">
                {ai.initial}
              </div>
              <div className="chat-bubble-ai px-5 py-4 flex items-center gap-1.5">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          ) : null}

          {/* Welcome state — shown when the chat is fresh */}
          {isEmpty ? (
            <div className="pt-10 pb-4 flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white text-3xl mb-5 shadow-[0_0_40px_-8px_var(--accent-glow)]">
                {ai.initial}
              </div>
              <h2 className="font-display text-2xl font-bold mb-2">Hi, I&apos;m {ai.name}</h2>
              <p className="text-[var(--muted)] max-w-md mb-8">
                Ask me anything about {siteConfig.name} — rules, members, builds, or how to join.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    className="card px-5 py-4 flex items-center gap-3 text-left hover:border-[var(--accent)] transition"
                    onClick={() => void send(s.text)}
                  >
                    <i className={`fa-solid ${s.icon} text-[var(--accent)]`} />
                    <span className="text-sm text-[var(--fg-2)]">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Input pinned to the bottom */}
      <div className="flex-shrink-0 w-full max-w-3xl mx-auto px-4 sm:px-6 pt-3 pb-6">
        <div className="card px-4 py-3 flex items-end gap-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
          <i className="fa-solid fa-greater-than text-[var(--muted-2)] text-sm mb-2.5 hidden sm:block" />
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
            className="flex-1 bg-transparent outline-none resize-none text-[15px] leading-relaxed placeholder:text-[var(--muted-2)] max-h-40 py-1.5"
          />
          {typing ? (
            <button
              onClick={stop}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--redstone)]/15 text-[var(--redstone)] hover:bg-[var(--redstone)]/25 transition flex-shrink-0"
              aria-label="Stop generating"
            >
              <i className="fa-solid fa-stop text-sm" />
            </button>
          ) : (
            <button
              onClick={() => void send()}
              disabled={!input.trim()}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--accent)] text-white hover:bg-[var(--accent-bright)] transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 shadow-[0_0_16px_-6px_var(--accent-glow)]"
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
    </section>
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
