// Free, keyless web search for the AI assistant.
//
// Two sources, no API keys needed:
//   1. DuckDuckGo Instant Answers (official JSON endpoint).
//   2. Wikipedia search + page summaries.
// The chat route hands the combined snippets to the model so it can
// answer current questions (season recipes, mods, wiki topics, etc.)
// instead of guessing.

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

/** DuckDuckGo Instant Answer — returns one result when an answer exists. */
async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const data = await fetchJson(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
  );
  if (!data || typeof data !== "object") return [];
  const d = data as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    Answer?: string;
    AnswerType?: string;
  };
  if (d.AbstractText) {
    return [
      {
        title: d.Heading || query,
        url: d.AbstractURL || "https://duckduckgo.com",
        snippet: d.AbstractText.slice(0, 500),
      },
    ];
  }
  if (d.Answer) {
    return [
      {
        title: d.AnswerType || query,
        url: "https://duckduckgo.com",
        snippet: d.Answer.slice(0, 500),
      },
    ];
  }
  return [];
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

/**
 * Run a web search for `query` and return up to 5 combined results.
 * Never throws — an empty array just means "no results found".
 */
export async function webSearch(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim().slice(0, 200);
  if (!trimmed) return [];

  const [ddg, wiki] = await Promise.all([
    searchDuckDuckGo(trimmed).catch(() => [] as SearchResult[]),
    searchWikipedia(trimmed).catch(() => [] as SearchResult[]),
  ]);

  // Dedupe by url, prefer DuckDuckGo's answer first.
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const r of [...ddg, ...wiki]) {
    if (!r.snippet || seen.has(r.url)) continue;
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
