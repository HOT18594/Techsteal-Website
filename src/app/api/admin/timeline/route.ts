import { NextRequest, NextResponse } from "next/server";
import { asc, count, desc, eq, inArray } from "drizzle-orm";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import { getDb, type Db } from "@/lib/db";
import { fallbackTimeline } from "@/lib/fallback-data";
import { parseBodyId, parseRouteId } from "@/lib/route-ids";
import { timelineEvents } from "@/lib/schema";
import { siteConfig } from "@/lib/site";
import type { Account } from "@/types";

export const dynamic = "force-dynamic";

async function requireAdminAndDb(): Promise<
  { error: NextResponse } | { admin: Account; db: Db }
> {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return { error: NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 }) };
  }
  if (gate.status === "no") {
    return { error: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  }
  const db = getDb();
  if (!db) {
    return { error: NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 }) };
  }
  return { admin: gate.account, db };
}

function formatNiceDate(raw?: string): string {
  const candidate = (raw ?? "").trim() || siteConfig.seasonStart;
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    const parsed = new Date(`${candidate}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(parsed);
    }
  }
  return candidate.slice(0, 40);
}

function validateEventInput(raw: Record<string, unknown>):
  | {
      date: string;
      title: string;
      era: string;
      major: boolean;
      description: string | null;
    }
  | { error: string } {
  const date = typeof raw.date === "string" ? raw.date.trim() : "";
  if (date.length < 1 || date.length > 40) {
    return { error: "Event date label must be between 1 and 40 characters." };
  }

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title.length < 2 || title.length > 120) {
    return { error: "Event title must be between 2 and 120 characters." };
  }

  let era = "Current Season";
  if (raw.era !== undefined && raw.era !== null) {
    if (typeof raw.era !== "string") {
      return { error: "Invalid era value." };
    }
    const trimmedEra = raw.era.trim();
    if (trimmedEra.length > 0) {
      if (trimmedEra.length > 50) {
        return { error: "Era must be 50 characters or fewer." };
      }
      era = trimmedEra;
    }
  }

  if (raw.major !== undefined && typeof raw.major !== "boolean") {
    return { error: "Invalid major flag." };
  }
  const major = Boolean(raw.major);

  let description: string | null = null;
  if (raw.description !== undefined && raw.description !== null) {
    if (typeof raw.description !== "string") {
      return { error: "Invalid description." };
    }
    const trimmedDesc = raw.description.trim();
    if (trimmedDesc.length > 600) {
      return { error: "Description must be 600 characters or fewer." };
    }
    description = trimmedDesc.length > 0 ? trimmedDesc : null;
  }

  return { date, title, era, major, description };
}

export async function GET() {
  const guard = await requireAdminAndDb();
  if ("error" in guard) return guard.error;

  try {
    const events = await guard.db
      .select()
      .from(timelineEvents)
      .orderBy(desc(timelineEvents.id));
    return NextResponse.json({
      events,
      usingFallback: events.length === 0,
      fallback: [...fallbackTimeline].reverse(),
    });
  } catch (err) {
    console.error("api/admin/timeline GET: query failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminAndDb();
  if ("error" in guard) return guard.error;
  const { admin, db } = guard;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  if (raw.action === "seed_defaults") {
    try {
      const [{ n }] = await db.select({ n: count() }).from(timelineEvents);
      if (Number(n) > 0 && raw.force !== true) {
        return NextResponse.json(
          { error: "Timeline events already exist in the database." },
          { status: 409 }
        );
      }

      // Insert oldest-first so highest serial ID = newest under desc(id).
      await db.insert(timelineEvents).values(
        fallbackTimeline.map((e) => ({
          date: e.date,
          title: e.title,
          era: e.era,
          major: e.major,
          description: e.description ?? null,
        }))
      );

      await logAudit({
        actorId: admin.id,
        actorName: admin.username,
        action: "timeline_create",
        detail: "Seeded default timeline events",
      });

      const events = await db
        .select()
        .from(timelineEvents)
        .orderBy(desc(timelineEvents.id));
      return NextResponse.json({ ok: true, events });
    } catch (err) {
      console.error("api/admin/timeline POST seed_defaults: failed", err);
      return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
    }
  }

  if (raw.action === "season_transition") {
    const mode = raw.mode === "prep" || raw.mode === "launch" ? raw.mode : null;
    if (!mode) {
      return NextResponse.json(
        { error: "Transition mode must be prep or launch." },
        { status: 400 }
      );
    }
    if (
      raw.launchDate !== undefined &&
      raw.launchDate !== null &&
      typeof raw.launchDate !== "string"
    ) {
      return NextResponse.json({ error: "Invalid launch date." }, { status: 400 });
    }
    const rawLaunchDate =
      typeof raw.launchDate === "string" ? raw.launchDate.trim() : "";
    if (rawLaunchDate.length > 40) {
      return NextResponse.json(
        { error: "Launch date label must be 40 characters or fewer." },
        { status: 400 }
      );
    }

    const targetDate =
      mode === "launch" ? formatNiceDate(rawLaunchDate || undefined) : "Coming soon";
    const defaultDescription =
      mode === "launch"
        ? `${siteConfig.season} is live — a fresh world on ${siteConfig.software} ${siteConfig.version} with ${siteConfig.maxPlayers} player slots. New season, new story.`
        : `${siteConfig.season} is coming soon — a fresh world on ${siteConfig.software} ${siteConfig.version} with ${siteConfig.maxPlayers} player slots. New season, new story.`;

    try {
      await db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(timelineEvents)
          .orderBy(asc(timelineEvents.id))
          .for("update");

        const prevPrefix = siteConfig.previousSeason.toLowerCase();
        for (const row of rows) {
          if (
            row.title.toLowerCase().startsWith(prevPrefix) &&
            row.era === "Current Season"
          ) {
            const lowerDate = row.date.trim().toLowerCase();
            const nextDate =
              lowerDate === "live" || lowerDate === "current"
                ? "Concluded"
                : row.date;
            await tx
              .update(timelineEvents)
              .set({ era: "Past Seasons", date: nextDate })
              .where(eq(timelineEvents.id, row.id));
          }
        }

        const currentPrefix = siteConfig.season.toLowerCase();
        const matchingCurrent = rows.filter((r) =>
          r.title.toLowerCase().startsWith(currentPrefix)
        );
        const existingCurrent =
          matchingCurrent.length > 0
            ? matchingCurrent[matchingCurrent.length - 1]
            : null;

        if (existingCurrent) {
          let nextDescription = existingCurrent.description;
          const prepPrefix = `${siteConfig.season} is coming soon —`;
          const livePrefix = `${siteConfig.season} is live —`;
          if (mode === "launch" && nextDescription?.startsWith(prepPrefix)) {
            nextDescription = nextDescription.replace(prepPrefix, livePrefix);
          } else if (mode === "prep" && nextDescription?.startsWith(livePrefix)) {
            nextDescription = nextDescription.replace(livePrefix, prepPrefix);
          } else if (!nextDescription) {
            nextDescription = defaultDescription;
          }

          await tx
            .update(timelineEvents)
            .set({
              date: targetDate,
              era: "Current Season",
              major: true,
              description: nextDescription,
            })
            .where(eq(timelineEvents.id, existingCurrent.id));
        } else {
          await tx.insert(timelineEvents).values({
            date: targetDate,
            title: siteConfig.season,
            era: "Current Season",
            major: true,
            description: defaultDescription,
          });
        }
      });

      await logAudit({
        actorId: admin.id,
        actorName: admin.username,
        action: "timeline_update",
        targetName: siteConfig.season,
        detail:
          mode === "launch"
            ? "Marked current season live in timeline"
            : "Prepared upcoming season in timeline",
      });

      const events = await db
        .select()
        .from(timelineEvents)
        .orderBy(desc(timelineEvents.id));
      return NextResponse.json({ ok: true, events });
    } catch (err) {
      console.error("api/admin/timeline POST season_transition: failed", err);
      return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
    }
  }

  const parsed = validateEventInput(raw);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const [event] = await db
      .insert(timelineEvents)
      .values(parsed)
      .returning();

    await logAudit({
      actorId: admin.id,
      actorName: admin.username,
      action: "timeline_create",
      targetId: String(event.id),
      targetName: event.title,
      detail: `${event.era} · ${event.date}`,
    });

    return NextResponse.json({ event });
  } catch (err) {
    console.error("api/admin/timeline POST: insert failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdminAndDb();
  if ("error" in guard) return guard.error;
  const { admin, db } = guard;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  if (raw.action === "swap") {
    const idA = parseBodyId(raw.idA);
    const idB = parseBodyId(raw.idB);
    if (!idA || !idB || idA === idB) {
      return NextResponse.json(
        { error: "Provide two distinct timeline event IDs to reorder." },
        { status: 400 }
      );
    }

    try {
      const swapped = await db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(timelineEvents)
          .where(inArray(timelineEvents.id, [idA, idB]))
          .orderBy(asc(timelineEvents.id))
          .for("update");
        if (rows.length !== 2) return null;
        const [first, second] = rows;
        await tx
          .update(timelineEvents)
          .set({
            date: second.date,
            title: second.title,
            era: second.era,
            major: second.major,
            description: second.description,
          })
          .where(eq(timelineEvents.id, first.id));
        await tx
          .update(timelineEvents)
          .set({
            date: first.date,
            title: first.title,
            era: first.era,
            major: first.major,
            description: first.description,
          })
          .where(eq(timelineEvents.id, second.id));
        return { firstTitle: first.title, secondTitle: second.title };
      });

      if (!swapped) {
        return NextResponse.json(
          { error: "One or both timeline events were not found." },
          { status: 404 }
        );
      }

      await logAudit({
        actorId: admin.id,
        actorName: admin.username,
        action: "timeline_reorder",
        detail: `Swapped "${swapped.firstTitle}" and "${swapped.secondTitle}"`,
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error("api/admin/timeline PUT swap: failed", err);
      return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
    }
  }

  const id = parseBodyId(raw.id);
  if (!id) {
    return NextResponse.json({ error: "Valid event id is required." }, { status: 400 });
  }

  const parsed = validateEventInput(raw);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(timelineEvents)
      .set(parsed)
      .where(eq(timelineEvents.id, id))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: "Timeline event not found." }, { status: 404 });
    }

    await logAudit({
      actorId: admin.id,
      actorName: admin.username,
      action: "timeline_update",
      targetId: String(updated.id),
      targetName: updated.title,
      detail: `${updated.era} · ${updated.date}`,
    });

    return NextResponse.json({ event: updated });
  } catch (err) {
    console.error("api/admin/timeline PUT: update failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdminAndDb();
  if ("error" in guard) return guard.error;
  const { admin, db } = guard;

  const body = await request.json().catch(() => null);
  const rawId =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).id
      : undefined;
  const id = parseBodyId(rawId) ?? parseRouteId(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "Valid event id is required." }, { status: 400 });
  }

  try {
    const [deleted] = await db
      .delete(timelineEvents)
      .where(eq(timelineEvents.id, id))
      .returning();
    if (!deleted) {
      return NextResponse.json({ error: "Timeline event not found." }, { status: 404 });
    }

    await logAudit({
      actorId: admin.id,
      actorName: admin.username,
      action: "timeline_delete",
      targetId: String(deleted.id),
      targetName: deleted.title,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("api/admin/timeline DELETE: failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}
