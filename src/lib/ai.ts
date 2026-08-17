// AI assistant helper. Talks to any OpenAI-compatible /chat/completions
// endpoint. The API key lives in the server environment (never the client).
// If no key is configured, it returns a friendly "not connected" message.

import { siteConfig } from "./site";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const NOT_CONFIGURED = (message: string) =>
  `The AI assistant isn't connected yet — set AI_API_KEY in your environment to enable live answers. (You asked: "${message}")`;

const ERROR_MESSAGE =
  "I couldn't reach the AI service right now. Try again in a moment.";

export async function getChatResponse(message: string): Promise<string> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(
    /\/+$/,
    ""
  );
  const model = process.env.AI_MODEL ?? "gpt-4o-mini";

  if (!apiKey) return NOT_CONFIGURED(message);

  const system = [
    `You are ${siteConfig.assistant.name}, the assistant for the private Minecraft server "${siteConfig.name}".`,
    `Server address: ${process.env.MINECRAFT_SERVER ?? siteConfig.address}.`,
    "Answer questions about the server, its members, builds, and rules.",
    "Be friendly, concise, and accurate. If you don't know something, say so.",
  ].join(" ");

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: message },
        ],
      }),
    });

    if (!res.ok) throw new Error(`chat completions returned ${res.status}`);

    const data = (await res.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    return content || "I couldn't generate a response. Try rephrasing.";
  } catch {
    return ERROR_MESSAGE;
  }
}
