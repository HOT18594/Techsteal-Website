import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { RSS_ALTERNATE_TYPES, SHARE_IMAGES } from "@/app/shared-metadata";
import { getDb } from "@/lib/db";
import { markdownExcerpt } from "@/lib/excerpt";
import { fallbackThreads } from "@/lib/fallback-data";
import { parseRouteId } from "@/lib/route-ids";
import { forumThreads } from "@/lib/schema";
import { siteConfig } from "@/lib/site";
import { ThreadClient } from "./ThreadClient";

// Strict route id parse, shared with the API routes (digits only, positive,
// inside Postgres INT4). The old `Number.parseInt` let `/forum/12abc` render
// thread 12 with HTTP 200 under thread 12's metadata; non-canonical ids are a
// real 404 now, matching GET /api/forum/[id]'s rejection of the same input.
function canonicalThreadId(raw: string): number {
  const id = parseRouteId(raw);
  if (id === null) notFound();
  return id;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: raw } = await params;
  const numId = canonicalThreadId(raw);

  let title: string | null = null;
  let content = "";
  let author = "";
  let category = "General";

  try {
    const db = getDb();
    if (db) {
      const [row] = await db
        .select({
          title: forumThreads.title,
          content: forumThreads.content,
          author: forumThreads.author,
          category: forumThreads.category,
        })
        .from(forumThreads)
        .where(eq(forumThreads.id, numId))
        .limit(1);
      if (row) {
        title = row.title;
        content = row.content;
        author = row.author;
        category = row.category;
      } else {
        return { title: "Thread not found", robots: { index: false, follow: false } };
      }
    }
  } catch (err) {
    console.error("forum/[id] generateMetadata failed:", err);
  }

  if (!title) {
    const fb = fallbackThreads.find((t) => t.id === numId);
    if (fb) {
      title = fb.title;
      content = fb.content ?? "";
      author = fb.author;
      category = fb.category;
    }
  }

  if (!title) {
    return { title: "Discussion" };
  }

  const excerpt = content ? markdownExcerpt(content) : "";
  const description = excerpt || `Discussion by ${author} in ${category}.`;
  const path = `/forum/${numId}`;

  // Next replaces the whole `openGraph`/`alternates` objects, so re-declare
  // the layout's share image, site name, and RSS link explicitly.
  return {
    title,
    description,
    alternates: {
      canonical: path,
      types: RSS_ALTERNATE_TYPES,
    },
    openGraph: {
      title,
      description,
      type: "article",
      siteName: siteConfig.name,
      url: path,
      images: SHARE_IMAGES,
    },
  };
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  canonicalThreadId(id);
  return <ThreadClient />;
}
