// Free, keyless web search for the AI assistant.
//
// Three sources, no API keys needed:
//   1. DuckDuckGo Instant Answers (official JSON endpoint).
//   2. Minecraft Wiki (MediaWiki API) — the authoritative source for mods,
//      mechanics and versions; DDG/Wikipedia are near-useless for these.
//   3. Wikipedia search + page summaries.
// The chat route hands the combined snippets to the model so it can
// answer current questions (season recipes, mods, wiki topics, etc.)
// instead of guessing.

import { keywordQuery } from "./query-words";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const TIMEOUT_MS = 4000;

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "TechstealAssistant/1.0 (site assistant)" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Words ignored when judging whether a result is actually relevant. */
const RELEVANCE_STOPWORDS = new Set([
  "minecraft", "the", "a", "an", "of", "for", "and", "or", "to", "in", "on",
  "what", "how", "best", "good", "new", "list", "wiki", "mod", "mods",
]);

/** DDG's index entries are noisy — only keep ones that share a real
 *  keyword with the query (title or URL). Without this, a query like
 *  "create aeronautics minecraft" pulls in total irrelevancies. */
function isRelevant(result: { title: string; url: string }, query: string): boolean {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !RELEVANCE_STOPWORDS.has(w));
  if (tokens.length === 0) return true;
  const haystack = `${result.title} ${result.url}`.toLowerCase();
  return tokens.some((t) => haystack.includes(t));
}

/** DuckDuckGo Instant Answer — the abstract/answer when one exists, plus
 *  RelatedTopics (DDG's index entries), split so callers can merge the
 *  noisy related list after the cleaner wiki sources. */
async function searchDuckDuckGo(
  query: string
): Promise<{ primary: SearchResult[]; related: SearchResult[] }> {
  const data = await fetchJson(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
  );
  if (!data || typeof data !== "object") return { primary: [], related: [] };
  const d = data as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    Answer?: string;
    AnswerType?: string;
    RelatedTopics?: Array<{
      Text?: string;
      FirstURL?: string;
      Topics?: Array<{ Text?: string; FirstURL?: string }>;
    }>;
  };
  const primary: SearchResult[] = [];
  if (d.AbstractText) {
    primary.push({
      title: d.Heading || query,
      url: d.AbstractURL || "https://duckduckgo.com",
      snippet: d.AbstractText.slice(0, 500),
    });
  } else if (d.Answer) {
    primary.push({
      title: d.AnswerType || query,
      url: "https://duckduckgo.com",
      snippet: d.Answer.slice(0, 500),
    });
  }
  // RelatedTopics may be flat entries or {Name, Topics: [...]} groups.
  const related: SearchResult[] = [];
  const flat = (d.RelatedTopics ?? []).flatMap((rt) =>
    Array.isArray(rt.Topics) && rt.Topics.length > 0 ? rt.Topics : rt.Text && rt.FirstURL ? [rt] : []
  );
  for (const t of flat) {
    if (!t.Text || !t.FirstURL) continue;
    // duckduckgo.com/... URLs in RelatedTopics are disambiguation stubs
    // ("Create (song)", "Create (TV network)") — not real destinations.
    if (t.FirstURL.startsWith("https://duckduckgo.com/")) continue;
    const candidate = {
      title: (t.Text.split(" - ")[0] || t.FirstURL).slice(0, 120),
      url: t.FirstURL,
      snippet: t.Text.slice(0, 400),
    };
    if (!isRelevant(candidate, query)) continue;
    related.push(candidate);
    if (related.length >= 3) break;
  }
  return { primary, related };
}

/** Wikipedia search — top matching articles with their intro snippets. */
async function searchWikipedia(query: string): Promise<SearchResult[]> {
  const data = await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&format=json&srlimit=3&srprop=snippet`
  );
  if (!data || typeof data !== "object") return [];
  const d = data as {
    query?: { search?: Array<{ title: string; snippet: string }> };
  };
  const hits = d.query?.search ?? [];
  const results: SearchResult[] = [];
  for (const hit of hits.slice(0, 3)) {
    const clean = hit.snippet.replace(/<[^>]+>/g, "");
    const title = hit.title;
    results.push({
      title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      snippet: clean.slice(0, 400),
    });
  }
  return results;
}

/** Minecraft Wiki — same MediaWiki search API as Wikipedia. This is where
 *  mod/modpack/mechanic answers actually live; failing soft is fine. */
async function searchMinecraftWiki(query: string): Promise<SearchResult[]> {
  const data = await fetchJson(
    `https://minecraft.wiki/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&format=json&srlimit=3&srprop=snippet`
  );
  if (!data || typeof data !== "object") return [];
  const d = data as {
    query?: { search?: Array<{ title: string; snippet: string }> };
  };
  const hits = d.query?.search ?? [];
  const results: SearchResult[] = [];
  for (const hit of hits.slice(0, 3)) {
    const clean = hit.snippet.replace(/<[^>]+>/g, "");
    const title = hit.title;
    results.push({
      title: `${title} — Minecraft Wiki`,
      url: `https://minecraft.wiki/w/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      snippet: clean.slice(0, 400),
    });
  }
  return results;
}

/**
 * Run a web search for `query` and return up to 5 combined results.
 * Never throws — an empty array just means "no results found".
 */
export async function webSearch(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim().slice(0, 200);
  if (!trimmed) return [];
  // All sources here are keyword-based and choke on full sentences
  // ("how to find ancient debris" returns junk from both wikis) — search
  // with the extracted keywords.
  const q = keywordQuery(trimmed) || trimmed;

  const [ddg, mcwiki, wiki] = await Promise.all([
    searchDuckDuckGo(q).catch(() => ({ primary: [], related: [] })),
    searchMinecraftWiki(q).catch(() => [] as SearchResult[]),
    searchWikipedia(q).catch(() => [] as SearchResult[]),
  ]);

  // Dedupe by url. Priority: DDG's instant answer, then the Minecraft Wiki
  // (clean, on-topic), then DDG's filtered index entries, then Wikipedia.
  // Wiki full-text search matches loose common words (querying "create
  // aeronautics" surfaces Kirsten Dunst of all things), so relevance-filter
  // everything except DDG's trusted instant answer — junk context is worse
  // than none.
  const ranked = [
    ...ddg.primary.map((r) => ({ r, trusted: true })),
    ...[...mcwiki, ...ddg.related, ...wiki].map((r) => ({ r, trusted: false })),
  ];
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const { r, trusted } of ranked) {
    if (!r.snippet || seen.has(r.url)) continue;
    if (!trusted && !isRelevant(r, q)) continue;
    seen.add(r.url);
    merged.push(r);
    if (merged.length >= 5) break;
  }
  return merged;
}

/** Render search results as a compact text block for the model prompt. */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return "No web results were found.";
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
    .join("\n\n");
}
