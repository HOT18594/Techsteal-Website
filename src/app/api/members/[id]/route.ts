import { NextRequest, NextResponse } from "next/server";
import { getPublicProfile } from "@/lib/public-profile";

export const dynamic = "force-dynamic";

// Public in-game profile. No auth required — it exposes only what the member
// directory already shows, plus the member's own public builds and threads.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Account ids are "discord:<snowflake>"; anything else can't match a row.
  if (!id || !id.startsWith("discord:")) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  try {
    const profile = await getPublicProfile(id);
    if (!profile) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch (err) {
    console.error("api/members/[id]: query failed", err);
    return NextResponse.json({ error: "Couldn't load this profile right now." }, { status: 503 });
  }
}