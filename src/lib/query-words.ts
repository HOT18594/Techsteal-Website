/**
 * Turn a chatty player question ("can I use the create aeronautics mod on
 * the server?", "how to find ancient debris") into a bare keyword query.
 * Every external search source here is keyword-based — DuckDuckGo's
 * Instant Answer API and both MediaWiki endpoints return junk (or nothing)
 * for full sentences, so callers normalize before searching.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "can", "could", "should", "would", "i", "you", "we", "my", "me",
  "is", "are", "do", "does", "did", "what", "which", "how", "why", "when", "where",
  "any", "some", "good", "best", "new", "for", "to", "of", "on", "in", "with",
  "about", "and", "or", "it", "its", "this", "that", "there", "use", "using",
  "used", "server", "minecraft", "mc", "mod", "mods", "modpack", "modpacks",
  "shader", "shaders", "resource", "pack", "packs", "datapack", "datapacks",
  "play", "playing", "allowed", "allow", "install", "installing", "get",
  "like", "similar", "tell", "show", "please", "recommend", "recommendation",
  "recommendations", "top", "does", "theres", "there's", "whats", "what's",
  "search", "searches", "searching", "websearch", "web", "look", "looking",
  "lookup", "need", "want", "know", "google", "up",
]);

export function keywordQuery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    .slice(0, 6)
    .join(" ");
}
