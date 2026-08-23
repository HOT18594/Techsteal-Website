// Modrinth search — the authoritative, keyless source for Minecraft mods,
// modpacks, shaders and resource packs. Public v2 API, no key required
// (just a descriptive User-Agent, which Modrinth asks for).
//
// DDG/Wikipedia are near-useless for mod questions ("create aeronautics"
// returns an empty DDG payload), so Chatty routes mod questions here.

export interface ModrinthHit {
  title: string;
  slug: string;
  author: string;
  description: string;
  downloads: number;
  follows: number;
  projectType: string;
  categories: string[];
  /** "required" | "optional" | "unsupported" per side. */
  clientSide?: string;
  serverSide?: string;
  versions?: string[];
  url: string;
}

import { keywordQuery } from "./query-words";

function projectUrl(projectType: string, slug: string): string {
  const kind =
    projectType === "modpack" || projectType === "shader" || projectType === "resourcepack"
      ? projectType
      : "mod";
  return `https://modrinth.com/${kind}/${slug}`;
}

/** 1234567 → "1.2M" for compact model-facing lines. */
function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

interface ModrinthSearchResponse {
  hits?: Array<{
    title?: string;
    slug?: string;
    author?: string;
    description?: string;
    downloads?: number;
    follows?: number;
    project_type?: string;
    categories?: string[];
    client_side?: string;
    server_side?: string;
    versions?: string[];
  }>;
}

/** Words that add nothing to a repository search live in query-words.ts —
 *  Modrinth is keyword-based; chatty phrasings return zero hits without it. */

/**
 * Search Modrinth for `query`. Chatty phrasings fall back to a
 * keyword-extracted query. Never throws — an empty array means "nothing on
 * Modrinth" (unreleased/renamed mods), which callers should relay to the
 * model as a nudge toward web_search.
 */
export async function searchModrinth(query: string, limit = 4): Promise<ModrinthHit[]> {
  const run = async (q: string): Promise<ModrinthHit[]> => {
    try {
      const res = await fetch(
        `https://api.modrinth.com/v2/search?query=${encodeURIComponent(q)}&limit=${limit}`,
        {
          headers: { "User-Agent": "TechstealAssistant/1.0 (site assistant)" },
          cache: "no-store",
          signal: AbortSignal.timeout(5_000),
        }
      );
      if (!res.ok) return [];
      const data = (await res.json()) as ModrinthSearchResponse;
      const hits = Array.isArray(data.hits) ? data.hits : [];
      return hits
        .filter((h) => h.title && h.slug)
        .map((h) => ({
          title: h.title!,
          slug: h.slug!,
          author: h.author ?? "unknown",
          description: (h.description ?? "").slice(0, 300),
          downloads: h.downloads ?? 0,
          follows: h.follows ?? 0,
          projectType: h.project_type ?? "mod",
          categories: (h.categories ?? []).slice(0, 6),
          clientSide: h.client_side,
          serverSide: h.server_side,
          versions: (h.versions ?? []).slice(-3),
          url: projectUrl(h.project_type ?? "mod", h.slug!),
        }));
    } catch {
      return [];
    }
  };

  const trimmed = query.trim().slice(0, 100);
  if (!trimmed) return [];
  const direct = await run(trimmed);
  if (direct.length > 0) return direct;
  // Zero hits on a long, chatty query → retry with just the keywords.
  const keywords = keywordQuery(trimmed);
  if (keywords && keywords !== trimmed.toLowerCase()) {
    return run(keywords);
  }
  return [];
}

/** Render Modrinth hits as a compact text block for the model prompt. */
export function formatModrinthResults(hits: ModrinthHit[]): string {
  if (hits.length === 0) return "No Modrinth results.";
  return hits
    .map(
      (h) =>
        `- ${h.title} by ${h.author} — ${h.projectType}, ${fmtCount(h.downloads)} downloads` +
        `${h.versions?.length ? `, for ${h.versions.join("/")} (latest ${h.versions[h.versions.length - 1]})` : ""}` +
        `${h.clientSide && h.serverSide ? `, ${h.clientSide === "required" && h.serverSide === "required" ? "client+server" : h.serverSide === "required" ? "server-side" : "client-side"}` : ""}` +
        `\n  ${h.description}` +
        `\n  ${h.url}`
    )
    .join("\n");
}
