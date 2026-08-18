"use client";

import { useEffect, useRef, useState } from "react";
import { siteConfig } from "@/lib/site";
import { Reveal } from "@/components/Reveal";

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
      // Try the live AI endpoint if it's available; fall back to a local reply.
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
      { id: nextId.current++, role: "assistant", text: `Chat cleared. Ask me anything about ${siteConfig.name}.` },
    ]);
  };

  const ai = siteConfig.assistant;

  return (
    <section className="py-24 lg:py-32 px-6 lg:px-10">
      <div className="max-w-4xl mx-auto">
        <Reveal>
          <div className="text-center mb-12">
            <div className="section-label mb-4 inline-block">02 / AI Assistant</div>
            <h1 className="font-display text-5xl md:text-6xl font-bold mb-4">{ai.name}</h1>
          </div>
        </Reveal>

        <Reveal delay={1}>
          <div
            className="card overflow-hidden"
            style={{ background: "var(--bg-2)" }}
          >
            {/* Chat header */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white rounded-xl">
                    {ai.initial}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[var(--emerald)] border-3 border-[var(--card)] rounded-full" />
                </div>
                <div>
                  <div className="font-display font-bold text-xl">{ai.name}</div>
                  <div className="text-sm text-[var(--emerald)] flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-[var(--emerald)] rounded-full" />
                    {ai.tagline}
                  </div>
                </div>
              </div>
              <button
                className="text-[var(--muted)] hover:text-[var(--accent)] transition"
                onClick={clear}
                aria-label="Clear chat"
              >
                <i className="fa-solid fa-rotate-right text-lg" />
              </button>
            </div>

            {/* Chat messages */}
            <div
              ref={scrollRef}
              className="p-6 space-y-5 min-h-[500px] max-h-[70vh] overflow-y-auto"
              id="chat-messages"
            >
              {messages.map((m) =>
                m.role === "assistant" ? (
                  <div key={m.id} className="flex gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white text-sm flex-shrink-0 rounded-xl">
                      {ai.initial}
                    </div>
                    <div className="chat-bubble-ai p-4 max-w-[85%]">
                      <div className="text-base text-[var(--fg-2)] whitespace-pre-wrap">{m.text}</div>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-3 justify-end">
                    <div className="chat-bubble-user p-4 max-w-[85%]">
                      <div className="text-base text-[var(--fg)] whitespace-pre-wrap">{m.text}</div>
                    </div>
                    <div className="w-10 h-10 bg-[var(--accent)] flex items-center justify-center font-display font-bold text-white text-sm flex-shrink-0 rounded-xl">
                      YOU
                    </div>
                  </div>
                )
              )}
              {typing ? (
                <div className="flex gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white text-sm flex-shrink-0 rounded-xl">
                    {ai.initial}
                  </div>
                  <div className="chat-bubble-ai p-4 flex items-center gap-2">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              ) : null}
            </div>

            {/* Chat input */}
            <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--bg-2)]">
              <div className="flex items-center gap-2 bg-[var(--bg)] border border-[var(--border)] focus-within:border-[var(--accent)] transition px-4 py-3 rounded-lg">
                <i className="fa-solid fa-greater-than text-[var(--muted-2)] text-sm" />
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void send();
                  }}
                  placeholder={`Ask ${ai.name} anything…`}
                  className="flex-1 bg-transparent outline-none text-base placeholder:text-[var(--muted-2)]"
                />
                <button
                  onClick={() => void send()}
                  className="text-[var(--accent)] hover:text-[var(--accent-bright)] transition p-1"
                  aria-label="Send"
                >
                  <i className="fa-solid fa-paper-plane text-lg" />
                </button>
              </div>
              <div className="text-xs text-[var(--muted-2)] mt-2 px-1">
                {ai.name} may err. Verify critical info with the team.
              </div>
            </div>
          </div>
        </Reveal>

        {/* Suggestion chips */}
        <Reveal delay={2}>
          <div className="mt-8">
            <p className="text-sm text-[var(--muted)] mb-4 text-center">Quick questions</p>
            <div className="flex flex-wrap justify-center gap-3">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="prompt-chip"
                  onClick={() => void send(s)}
                >
                  <i className="fa-solid fa-comment-dots text-[var(--accent)] mr-2" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Asset placeholder for assistant page */}
        <Reveal delay={3}>
          <div className="mt-12 asset-placeholder aspect-video rounded-xl">
            <div className="asset-placeholder-content">
              <i className="fa-solid fa-robot asset-placeholder-icon" />
              <span className="asset-placeholder-text">NEXUS Visual / Demo</span>
              <span className="asset-placeholder-hint">Add animation or screenshot</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}