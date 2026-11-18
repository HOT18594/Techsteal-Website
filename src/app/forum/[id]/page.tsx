import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { markdownExcerpt } from "@/lib/excerpt";
import { fallbackThreads } from "@/lib/fallback-data";
import { forumThreads } from "@/lib/schema";
import { ThreadClient } from "./ThreadClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: raw } = await params;
  const numId = Number.parseInt(raw, 10);
  if (!Number.isInteger(numId) || numId <= 0) {
    return { title: "Thread not found", robots: { index: false, follow: false } };
  }

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

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
    },
  };
}

export default function ThreadPage() {
  return <ThreadClient />;
}
