"use client";

import { useEffect, useRef, useState } from "react";
import { siteConfig } from "@/lib/site";
import { Reveal } from "./Reveal";

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

export function Assistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: "assistant",
      text: `Hi, I'm ${siteConfig.assistant.name}. Ask me anything about ${siteConfig.name}.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
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
    setTyping(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = (await res.json()) as { reply?: string };
      setMessages((m) => [
        ...m,
        {
          id: nextId.current++,
          role: "assistant",
          text: data.reply ?? "I couldn't generate a response.",
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: nextId.current++,
          role: "assistant",
          text: "I couldn't reach the server. Try again in a moment.",
        },
      ]);
    } finally {
      setTyping(false);
    }
  };

  const clear = () => {
    setMessages([
      { id: nextId.current++, role: "assistant", text: `Chat cleared. Ask me anything about ${siteConfig.name}.` },
    ]);
  };

  const ai = siteConfig.assistant;

  return (
    <section id="assistant" className="relative py-24 lg:py-32 z-10">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: info + suggestions */}
          <Reveal>
            <div>
              <div className="section-label mb-4">02 / AI Assistant</div>
              <h2 className="font-display text-5xl md:text-6xl font-bold mb-8">{ai.name}</h2>

              <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-3">Try asking</div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="prompt-chip" onClick={() => void send(s)}>
                    <i className="fa-solid fa-comment-dots text-[var(--accent)] mr-1.5" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Right: chat interface */}
          <Reveal delay={2}>
            <div
              className="card overflow-hidden"
              style={{ background: "linear-gradient(180deg, var(--card) 0%, var(--bg-2) 100%)" }}
            >
              {/* Chat header */}
              <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 bg-[var(--accent)] flex items-center justify-center font-display font-bold text-[var(--bg)]">
                      {ai.initial}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[var(--emerald)] border-2 border-[var(--card)]" />
                  </div>
                  <div>
                    <div className="font-display font-bold">{ai.name}</div>
                    <div className="text-xs text-[var(--emerald)] flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-[var(--emerald)] rounded-full" />
                      {ai.tagline}
                    </div>
                  </div>
                </div>
                <button
                  className="text-[var(--muted)] hover:text-[var(--accent)] transition"
                  onClick={clear}
                  aria-label="Clear chat"
                >
                  <i className="fa-solid fa-rotate-right text-sm" />
                </button>
              </div>

              {/* Chat messages */}
              <div
                ref={scrollRef}
                className="p-6 space-y-5 min-h-[400px] max-h-[500px] overflow-y-auto"
                id="chat-messages"
              >
                {messages.map((m) =>
                  m.role === "assistant" ? (
                    <div key={m.id} className="flex gap-3">
                      <div className="w-8 h-8 bg-[var(--accent)] flex items-center justify-center font-display font-bold text-[var(--bg)] text-sm flex-shrink-0">
                        {ai.initial}
                      </div>
                      <div className="chat-bubble-ai p-3.5 max-w-[80%]">
                        <div className="text-sm text-[var(--fg-2)]">{m.text}</div>
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="flex gap-3 justify-end">
                      <div className="chat-bubble-user p-3.5 max-w-[80%]">
                        <div className="text-sm text-[var(--fg)]">{m.text}</div>
                      </div>
                      <div className="w-8 h-8 bg-[var(--accent)] flex items-center justify-center font-display font-bold text-[var(--bg)] text-sm flex-shrink-0">
                        YOU
                      </div>
                    </div>
                  )
                )}
                {typing ? (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-[var(--accent)] flex items-center justify-center font-display font-bold text-[var(--bg)] text-sm flex-shrink-0">
                      {ai.initial}
                    </div>
                    <div className="chat-bubble-ai p-3.5 flex items-center gap-1.5">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Chat input */}
              <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--bg-2)]">
                <div className="flex items-center gap-2 bg-[var(--bg)] border border-[var(--border)] focus-within:border-[var(--accent)] transition px-4 py-3">
                  <i className="fa-solid fa-greater-than text-[var(--muted-2)] text-sm" />
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void send();
                    }}
                    placeholder={`Ask ${ai.name} anything…`}
                    className="flex-1 bg-transparent outline-none text-sm placeholder:text-[var(--muted-2)]"
                  />
                  <button
                    onClick={() => void send()}
                    className="text-[var(--accent)] hover:text-[var(--accent-bright)] transition"
                    aria-label="Send"
                  >
                    <i className="fa-solid fa-paper-plane text-sm" />
                  </button>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
