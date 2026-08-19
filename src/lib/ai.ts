// AI assistant helper — Chatty Jr.
//
// Talks to any OpenAI-compatible /chat/completions endpoint (defaults to
// OpenRouter, which hosts the free Gemma model used here) and streams
// the reply back as plain text chunks. The API key lives in the server
// environment (never the client).
//
// Chatty Jr. is the server's support assistant: it helps players join,
// answers mod/wiki/crafting questions, and keeps replies short and
// friendly. It also gets free web-search results (DuckDuckGo + Wikipedia)
// so it can answer current questions instead of guessing.

import { siteConfig } from "./site";
import { formatSearchResults, webSearch } from "./web-search";

const NOT_CONFIGURED = (message: string) =>
  `The AI assistant isn't connected yet — set AI_API_KEY in your environment to enable live answers. (You asked: "${message}")`;

const ERROR_MESSAGE =
  "I couldn't reach the AI service right now. Try again in a moment.";

const RATE_LIMITED_MESSAGE =
  "I'm a bit swamped right now — the free AI is rate-limited. Give it a minute and try again!";

/** The assistant's role, topics, and style rules. */
export function buildSystemPrompt(): string {
  const c = siteConfig;
  return [
    `You are ${c.assistant.name}, the friendly support assistant for ${c.name}, a private ${c.software} Minecraft server. Your job is to help players the way a helpful support rep would.`,
    ``,
    `What you help with:`,
    `- Joining: the server address is ${c.address}, Java Edition ${c.version} (${c.software}, difficulty ${c.difficulty}). Walk through the steps: Minecraft → Multiplayer → Add Server → paste the address → join.`,
    `- Mods: explain what's generally allowed and point to the Rules page for the exact list. If you don't know a specific mod or plugin, say so honestly instead of guessing.`,
    `- Wiki and guides: point players to the site's wiki/forum sections and summarize what you know.`,
    `- Crafting for the current season (${c.season}): share recipes and crafting guidance. When you're not sure about current-season specifics, base your answer on the web search results included with the question, or tell them the details will be posted soon.`,
    ``,
    `Style rules (strict):`,
    `- Be warm, brief, and supportive — a helpful friend, not a textbook.`,
    `- Keep answers SHORT. A few sentences or a short bullet list is plenty. No essays, no fluff, no repeated caveats.`,
    `- Use easy-to-read formatting: short paragraphs, and bullets when there are steps or lists.`,
    `- Never reveal internal reasoning — just give the answer.`,
    `- If you genuinely don't know, say so and point to the Forum, Rules, or wiki instead of making things up.`,
    `- When web search results are included with the question, base your answer on them if they're relevant.`,
    ``,
    `Current date: ${new Date().toISOString().slice(0, 10)}`,
  ].join("\n");
}

const encoder = new TextEncoder();

function fetchCompletion(
  baseUrl: string,
  model: string,
  apiKey: string,
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
        { role: "system", content: buildSystemPrompt() },
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
  signal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1").replace(
    /\/+$/,
    ""
  );
  const model = process.env.AI_MODEL ?? "google/gemma-4-26b-a4b-it:free";

  if (!apiKey) return textStream(NOT_CONFIGURED(message));

  // Free web search (DuckDuckGo + Wikipedia, no key) so it can answer
  // current questions — seasonal recipes, mod names, wiki topics, etc.
  const results = await webSearch(message);
  const userContent = [
    `Question: ${message}`,
    ``,
    `Web search results:`,
    formatSearchResults(results),
    ``,
    `Use the web results when they answer the question; otherwise answer from your own knowledge.`,
  ].join("\n");

  let res = await fetchCompletion(baseUrl, model, apiKey, userContent, signal);
  if (res.status === 429) {
    // Free models share upstream rate limits — one short retry, then a
    // friendly streamed message instead of a hard failure.
    await new Promise((r) => setTimeout(r, 2000));
    if (signal?.aborted) return textStream("");
    res = await fetchCompletion(baseUrl, model, apiKey, userContent, signal);
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
