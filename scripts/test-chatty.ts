// Local smoke test for the Chatty agent: exercises every tool against the
// real DB/HTTP, then runs one full agent conversation through the model.
// Usage: npx tsx scripts/test-chatty.ts [--agent-only | --tools-only]

import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

import { executeChattyTool } from "../src/lib/chatty-tools";
import { streamChatReply } from "../src/lib/ai";

const mode = process.argv[2] ?? "--all";

async function testTools() {
  const calls: Array<[string, string]> = [
    ["get_server_status", "{}"],
    ["get_site_stats", "{}"],
    ["get_rules", "{}"],
    ["get_server_history", "{}"],
    ["search_members", '{"query":"a"}'],
    ["search_gallery", "{}"],
    ["search_forum", '{"query":"the"}'],
    ["web_search", '{"query":"minecraft 1.21 pale garden"}'],
  ];
  for (const [name, args] of calls) {
    const r = await executeChattyTool(name, args);
    console.log(`\n--- ${name} [${r.label}] ok=${r.ok} ---`);
    console.log(r.content.slice(0, 300).replace(/\n/g, " ¶ "));
  }
  // forum thread read (uses an id found above, else skips)
  const search = await executeChattyTool("search_forum", '{"query":"the"}');
  const idMatch = search.content.match(/#(\d+)/);
  if (idMatch) {
    const r = await executeChattyTool("read_forum_thread", `{"id":${idMatch[1]}}`);
    console.log(`\n--- read_forum_thread #${idMatch[1]} [${r.label}] ok=${r.ok} ---`);
    console.log(r.content.slice(0, 200).replace(/\n/g, " ¶ "));
  } else {
    console.log("\n--- read_forum_thread: skipped (no threads) ---");
  }
}

async function testAgent() {
  const question = "Is the server up right now, and how many members does the site have?";
  console.log(`\n=== AGENT RUN: "${question}" ===`);
  const stream = await streamChatReply(question, undefined, {
    username: "tester",
    role: "member",
    minecraftUsername: null,
    discordVerified: true,
  });
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev.t === "tool") console.log(`  [tool] ${ev.label} (${ev.name})`);
        else if (ev.t === "text") text += ev.v;
        else if (ev.t === "error") console.log(`  [error] ${ev.v}`);
      } catch {
        console.log(`  [raw] ${line.slice(0, 100)}`);
      }
    }
  }
  console.log(`\n  REPLY: ${text}`);
}

(async () => {
  if (mode !== "--agent-only") await testTools();
  if (mode !== "--tools-only") await testAgent();
  console.log("\ndone.");
  process.exit(0);
})().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
