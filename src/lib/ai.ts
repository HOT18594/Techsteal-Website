// AI assistant helper — Chatty Jr.
//
// Talks to any OpenAI-compatible /chat/completions endpoint (defaults to
// OpenRouter, which hosts the free Gemma model used here). The API key
// lives in the server environment (never the client).
//
// Chatty Jr. is the server's support assistant: it helps players join,
// answers mod/wiki/crafting questions, and keeps replies short and
// friendly. It also gets free web-search results (DuckDuckGo + Wikipedia)
// so it can answer current questions instead of guessing.

import { siteConfig } from "./site";
import { formatSearchResults, webSearch } from "./web-search";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const NOT_CONFIGURED = (message: string) =>
  `The AI assistant isn't connected yet — set AI_API_KEY in your environment to enable live answers. (You asked: "${message}")`;

const ERROR_MESSAGE =
  "I couldn't reach the AI service right now. Try again in a moment.";

const RATE_LIMITED_MESSAGE =
  "I'm a bit swamped right now — the free AI is rate-limited. Give it a minute and try again!";

/** The assistant's role, topics, and style rules. */
function buildSystemPrompt(): string {
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

export async function getChatResponse(message: string): Promise<string> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1").replace(
    /\/+$/,
    ""
  );
  const model = process.env.AI_MODEL ?? "google/gemma-4-26b-a4b-it:free";

  if (!apiKey) return NOT_CONFIGURED(message);

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

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
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
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("chatty: openrouter status", res.status, errBody.slice(0, 300));
      // Free models share upstream rate limits — short backoff retries
      // (staying inside the serverless timeout), then a friendly message.
      if (res.status === 429) {
        let delay = 2000;
        for (let attempt = 0; attempt < 2; attempt++) {
          await new Promise((r) => setTimeout(r, delay));
          const retry = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              max_tokens: 500,
              messages: [
                { role: "system", content: buildSystemPrompt() },
                { role: "user", content: userContent },
              ],
            }),
          });
          if (retry.ok) {
            const data = (await retry.json()) as ChatCompletionResponse;
            const content = data.choices?.[0]?.message?.content?.trim();
            if (content) return content;
          }
          if (retry.status !== 429) break;
          delay *= 2;
        }
        return RATE_LIMITED_MESSAGE;
      }
      throw new Error(`chat completions returned ${res.status}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    return content || "I couldn't generate a response. Try rephrasing.";
  } catch (err) {
    console.error("chatty: ai error", err instanceof Error ? err.message : String(err));
    return ERROR_MESSAGE;
  }
}
