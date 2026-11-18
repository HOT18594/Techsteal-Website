import { NextResponse } from "next/server";
import { count, desc, eq, gt, sql } from "drizzle-orm";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import { listAuditEntries } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { getExarotonConfig } from "@/lib/exaroton";
import { getLiveStatus } from "@/lib/live-status";
import {
  announcements,
  forumPolls,
  forumReplies,
  forumThreads,
  galleryComments,
  galleryItems,
  profiles,
  ruleSections,
  timelineEvents,
} from "@/lib/schema";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const db = getDb();
  const hostingFlags = {
    exarotonConfigured: getExarotonConfig() !== null,
    discordBotConfigured: Boolean(
      process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID
    ),
    storageConfigured: Boolean(
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
    aiConfigured: Boolean(process.env.AI_API_KEY),
  };

  const configSummary = {
    season: siteConfig.season,
    previousSeason: siteConfig.previousSeason,
    seasonLive: siteConfig.seasonLive,
    seasonStart: siteConfig.seasonStart,
    address: siteConfig.address,
    version: siteConfig.version,
    software: siteConfig.software,
    maxPlayers: siteConfig.maxPlayers,
  };

  if (!db) {
    const status = await getLiveStatus().catch(() => null);
    return NextResponse.json({
      dbConfigured: false,
      members: {
        active: 0,
        banned: 0,
        admins: 0,
        verified: 0,
        mcLinked: 0,
        pendingSetup: 0,
      },
      forum: {
        threads: 0,
        replies: 0,
        activePolls: 0,
      },
      gallery: {
        builds: 0,
        featured: 0,
        comments: 0,
      },
      content: {
        activeAnnouncements: 0,
        ruleSections: 0,
        timelineEvents: 0,
        seasonTimeline: {
          exists: false,
          id: null,
          title: null,
          date: null,
          era: null,
        },
      },
      hosting: {
        ...hostingFlags,
        status,
      },
      config: configSummary,
      auditEntries: [],
    });
  }

  try {
    const now = new Date();
    const [
      memberRows,
      threadCountRows,
      replyCountRows,
      activePollCountRows,
      galleryStatsRows,
      galleryCommentCountRows,
      activeAnnouncementRows,
      ruleSectionCountRows,
      timelineRows,
      status,
      auditEntries,
    ] = await Promise.all([
      db
        .select({
          active: sql<number>`count(*) filter (where not ${profiles.banned})::int`,
          banned: sql<number>`count(*) filter (where ${profiles.banned})::int`,
          admins: sql<number>`count(*) filter (where not ${profiles.banned} and ${profiles.role} = 'admin')::int`,
          verified: sql<number>`count(*) filter (where not ${profiles.banned} and ${profiles.discordVerified})::int`,
          mcLinked: sql<number>`count(*) filter (where not ${profiles.banned} and ${profiles.minecraftUsername} is not null and btrim(${profiles.minecraftUsername}) <> '')::int`,
          pendingSetup: sql<number>`count(*) filter (where not ${profiles.banned} and not ${profiles.onboarded})::int`,
        })
        .from(profiles),
      db.select({ n: count() }).from(forumThreads),
      db.select({ n: count() }).from(forumReplies),
      db.select({ n: count() }).from(forumPolls).where(gt(forumPolls.endsAt, now)),
      db
        .select({
          builds: sql<number>`count(*)::int`,
          featured: sql<number>`count(*) filter (where ${galleryItems.featured})::int`,
        })
        .from(galleryItems),
      db.select({ n: count() }).from(galleryComments),
      db
        .select({ n: count() })
        .from(announcements)
        .where(eq(announcements.active, true)),
      db.select({ n: count() }).from(ruleSections),
      db.select().from(timelineEvents).orderBy(desc(timelineEvents.id)),
      getLiveStatus().catch(() => null),
      listAuditEntries(8),
    ]);

    const m = memberRows[0];
    const g = galleryStatsRows[0];
    const seasonNeedle = siteConfig.season.toLowerCase();
    const seasonRow =
      timelineRows.find((r) => r.title.toLowerCase().startsWith(seasonNeedle)) ??
      timelineRows.find(
        (r) =>
          r.title.toLowerCase().includes(seasonNeedle) ||
          (r.description ?? "").toLowerCase().includes(seasonNeedle)
      ) ??
      null;

    return NextResponse.json({
      dbConfigured: true,
      members: {
        active: Number(m?.active ?? 0),
        banned: Number(m?.banned ?? 0),
        admins: Number(m?.admins ?? 0),
        verified: Number(m?.verified ?? 0),
        mcLinked: Number(m?.mcLinked ?? 0),
        pendingSetup: Number(m?.pendingSetup ?? 0),
      },
      forum: {
        threads: Number(threadCountRows[0]?.n ?? 0),
        replies: Number(replyCountRows[0]?.n ?? 0),
        activePolls: Number(activePollCountRows[0]?.n ?? 0),
      },
      gallery: {
        builds: Number(g?.builds ?? 0),
        featured: Number(g?.featured ?? 0),
        comments: Number(galleryCommentCountRows[0]?.n ?? 0),
      },
      content: {
        activeAnnouncements: Number(activeAnnouncementRows[0]?.n ?? 0),
        ruleSections: Number(ruleSectionCountRows[0]?.n ?? 0),
        timelineEvents: timelineRows.length,
        seasonTimeline: {
          exists: Boolean(seasonRow),
          id: seasonRow?.id ?? null,
          title: seasonRow?.title ?? null,
          date: seasonRow?.date ?? null,
          era: seasonRow?.era ?? null,
        },
      },
      hosting: {
        ...hostingFlags,
        status,
      },
      config: configSummary,
      auditEntries,
    });
  } catch (err) {
    console.error("api/admin/overview GET: query failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}
