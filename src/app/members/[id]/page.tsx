import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RSS_ALTERNATE_TYPES, SHARE_IMAGES } from "@/app/shared-metadata";
import { getPublicProfile } from "@/lib/public-profile";
import { siteConfig } from "@/lib/site";
import { ProfileClient } from "./ProfileClient";

// Server-render the profile so first paint (and crawlers/no-JS visitors) get
// real content. Unknown / banned / non-MC-linked ids resolve to the branded 404.
export const dynamic = "force-dynamic";

// Page params arrive percent-encoded ("discord%3A…"), unlike route handlers
// which get them decoded. Decode so the "discord:" prefix check and the DB
// lookup see the real id; malformed escapes fall through to the branded 404.
function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: raw } = await params;
  const id = decodeId(raw);
  const profile = id.startsWith("discord:") ? await getPublicProfile(id) : null;
  if (!profile) {
    return { title: "Member not found", robots: { index: false, follow: false } };
  }
  const description = `${profile.name} (${profile.minecraftUsername ?? profile.role}) on ${siteConfig.name} — ${profile.stats.builds} ${profile.stats.builds === 1 ? "build" : "builds"}, ${profile.stats.discussions} ${profile.stats.discussions === 1 ? "discussion" : "discussions"}.`;
  const path = `/members/${encodeURIComponent(profile.id)}`;
  // Next replaces the whole `openGraph`/`alternates` objects, so re-declare
  // the layout's share image (skin when available), site name, and RSS link.
  return {
    title: profile.name,
    description,
    alternates: {
      canonical: path,
      types: RSS_ALTERNATE_TYPES,
    },
    openGraph: {
      title: profile.name,
      description,
      type: "profile",
      siteName: siteConfig.name,
      url: path,
      images: profile.skinUrl ? [profile.skinUrl] : SHARE_IMAGES,
    },
  };
}

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: raw } = await params;
  const id = decodeId(raw);
  const profile = id.startsWith("discord:") ? await getPublicProfile(id) : null;
  if (!profile) notFound();
  return <ProfileClient profile={profile} />;
}
