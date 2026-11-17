import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumThreads } from "@/lib/schema";
import { siteConfig } from "@/lib/site";
import { markdownExcerpt } from "@/lib/excerpt";

export const dynamic = "force-dynamic";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.techsteal.space").replace(/\/$/, "");
const FEED_URL = `${BASE}/forum/rss.xml`;
const LIMIT = 30;

// Public RSS 2.0 feed of the latest forum discussions. Only already-public
// thread fields are emitted; descriptions are plain-text excerpts (spoilers
// and code stripped by markdownExcerpt), so nothing private leaks to readers.
export async function GET(): Promise<NextResponse> {
  let items = "";
  let lastBuild = new Date().toUTCString();

  const db = getDb();
  if (db) {
    try {
      const rows = await db
        .select({
          id: forumThreads.id,
          title: forumThreads.title,
          content: forumThreads.content,
          author: forumThreads.author,
          category: forumThreads.category,
          createdAt: forumThreads.createdAt,
          last: forumThreads.last,
        })
        .from(forumThreads)
        .orderBy(desc(forumThreads.createdAt))
        .limit(LIMIT);

      if (rows.length > 0) {
        lastBuild = rfc822(rows[0].createdAt?.toISOString() ?? rows[0].last);
      }
      items = rows.map((row) => itemXml(row)).join("");
    } catch (err) {
      console.error("forum/rss.xml: query failed", err);
      // Fall through to an empty-but-valid channel so readers don't break.
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>${esc(`${siteConfig.name} Forum`)}</title>
<link>${BASE}/forum</link>
<atom:link href="${FEED_URL}" rel="self" type="application/rss+xml" />
<description>${esc(`Latest discussions from the ${siteConfig.name} Minecraft community.`)}</description>
<language>en-us</language>
<lastBuildDate>${lastBuild}</lastBuildDate>
${items}</channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    },
  });
}

function itemXml(row: {
  id: number;
  title: string;
  content: string;
  author: string;
  category: string;
  createdAt: Date | null;
  last: string;
}): string {
  const url = `${BASE}/forum/${row.id}`;
  const pub = rfc822(row.createdAt?.toISOString() ?? row.last);
  return `<item>
<title>${esc(row.title)}</title>
<link>${url}</link>
<guid isPermaLink="true">${url}</guid>
<description>${esc(markdownExcerpt(row.content, 300))}</description>
<dc:creator>${esc(row.author)}</dc:creator>
<category>${esc(row.category)}</category>
<pubDate>${pub}</pubDate>
</item>
`;
}

/** RSS pubDate/lastBuildDate need an RFC-822 string; toUTCString is valid. */
function rfc822(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

/** Escape the five XML special characters so titles/excerpts can't break the feed. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}