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
    <section className="flex-1 min-h-0 flex items-center justify-center px-6 py-6">
      <div className="w-full max-w-2xl h-full min-h-0 flex flex-col gap-3">
        {/* Compact header */}
        <div className="card px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white rounded-xl">
                {ai.initial}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[var(--emerald)] border-2 border-[var(--card)] rounded-full" />
            </div>
            <div>
              <div className="font-display font-bold text-lg leading-tight">{ai.name}</div>
              <div className="text-xs text-[var(--emerald)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[var(--emerald)] rounded-full" />
                Online
              </div>
            </div>
          </div>
          <button
            className="text-[var(--muted)] hover:text-[var(--accent)] transition"
            onClick={clear}
            aria-label="Clear chat"
          >
            <i className="fa-solid fa-rotate-right text-base" />
          </button>
        </div>

        {/* Messages — scrolls internally, page never scrolls */}
        <div
          ref={scrollRef}
          className="card flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
          id="chat-messages"
        >
          {messages.map((m) =>
            m.role === "assistant" ? (
              <div key={m.id} className="flex gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white text-xs flex-shrink-0 rounded-lg">
                  {ai.initial}
                </div>
                <div className="chat-bubble-ai p-3.5 max-w-[85%]">
                  <div className="text-sm text-[var(--fg-2)] whitespace-pre-wrap">{m.text}</div>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-3 justify-end">
                <div className="chat-bubble-user p-3.5 max-w-[85%]">
                  <div className="text-sm text-[var(--fg)] whitespace-pre-wrap">{m.text}</div>
                </div>
                <div className="w-8 h-8 bg-[var(--accent)] flex items-center justify-center font-display font-bold text-white text-xs flex-shrink-0 rounded-lg">
                  YOU
                </div>
              </div>
            )
          )}
          {typing ? (
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white text-xs flex-shrink-0 rounded-lg">
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

        {/* Suggestions + input */}
        <div className="flex-shrink-0 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="prompt-chip text-xs py-1.5 px-3"
                onClick={() => void send(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="card px-4 py-3 flex items-center gap-2">
            <i className="fa-solid fa-greater-than text-[var(--muted-2)] text-xs" />
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
              className="text-[var(--accent)] hover:text-[var(--accent-bright)] transition p-1"
              aria-label="Send"
            >
              <i className="fa-solid fa-paper-plane text-sm" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}