"use client";

import { useEffect, useRef, useState } from "react";
import { siteConfig } from "@/lib/site";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
}

const SUGGESTIONS = [
  "What are the server rules?",
  "Who are the members?",
  "How do I join?",
  "What version is the server?",
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: "assistant",
      text: `Hey — I'm ${siteConfig.assistant.name}. Ask me anything about ${siteConfig.name}.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || typing) return;
    setMessages((m) => [...m, { id: nextId.current++, role: "user", text }]);
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
      setMessages((m) => [
        ...m,
        { id: nextId.current++, role: "assistant", text: reply },
      ]);
    } finally {
      setTyping(false);
    }
  };

  const clear = () => {
    setMessages([
      {
        id: nextId.current++,
        role: "assistant",
        text: `Chat cleared. Ask me anything about ${siteConfig.name}.`,
      },
    ]);
  };

  const ai = siteConfig.assistant;

  return (
    <section className="flex-1 min-h-0 flex flex-col">
      {/* Invisible top spacer — clears the floating wordmark/buttons */}
      <div aria-hidden="true" className="h-20 lg:h-24 flex-shrink-0" />

      {/* Header */}
      <header className="flex-shrink-0 w-full max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-11 h-11 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white rounded-xl">
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
          aria-label="Clear chat"
        >
          <i className="fa-solid fa-rotate-right" />
          <span className="hidden sm:inline">New chat</span>
        </button>
      </header>

      {/* Messages — fills the screen, scrolls internally */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto" id="chat-messages">
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-8">
          {messages.map((m) =>
            m.role === "assistant" ? (
              <div key={m.id} className="flex gap-4">
                <div className="w-9 h-9 mt-1 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white text-sm flex-shrink-0 rounded-lg">
                  {ai.initial}
                </div>
                <div className="chat-bubble-ai px-5 py-4 max-w-[90%]">
                  <div className="text-[15px] leading-relaxed text-[var(--fg-2)] whitespace-pre-wrap">
                    {m.text}
                  </div>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-4 justify-end">
                <div className="chat-bubble-user px-5 py-4 max-w-[90%]">
                  <div className="text-[15px] leading-relaxed text-[var(--fg)] whitespace-pre-wrap">
                    {m.text}
                  </div>
                </div>
                <div className="w-9 h-9 mt-1 bg-[var(--accent)] flex items-center justify-center font-display font-bold text-white text-sm flex-shrink-0 rounded-lg">
                  YOU
                </div>
              </div>
            )
          )}
          {typing ? (
            <div className="flex gap-4">
              <div className="w-9 h-9 mt-1 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white text-sm flex-shrink-0 rounded-lg">
                {ai.initial}
              </div>
              <div className="chat-bubble-ai px-5 py-4 flex items-center gap-1.5">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Suggestions + input pinned to the bottom */}
      <div className="flex-shrink-0 w-full max-w-3xl mx-auto px-4 sm:px-6 pt-3 pb-8">
        <div className="flex flex-wrap gap-2 justify-center mb-4">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="prompt-chip text-[13px] py-2 px-4"
              onClick={() => void send(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="card px-5 py-4 flex items-end gap-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
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
            className="flex-1 bg-transparent outline-none resize-none text-[15px] leading-relaxed placeholder:text-[var(--muted-2)] max-h-40 py-1"
          />
          <button
            onClick={() => void send()}
            disabled={typing || !input.trim()}
            className="text-[var(--accent)] hover:text-[var(--accent-bright)] transition p-2 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send"
          >
            <i className="fa-solid fa-paper-plane text-lg" />
          </button>
        </div>
        <p className="text-center text-xs text-[var(--muted-2)] mt-3">
          {siteConfig.name} · {ai.name} can make mistakes — double-check important info.
        </p>
      </div>
    </section>
  );
}