import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { RelativeTime } from "@/components/RelativeTime";
import { SubPage } from "@/components/SubPage";
import type { PublicProfile } from "@/types";

export function ProfileClient({ profile }: { profile: PublicProfile }) {
  const stats = [
    { label: "Builds", value: profile.stats.builds, icon: "fa-cube" },
    { label: "Discussions", value: profile.stats.discussions, icon: "fa-comments" },
    { label: "Replies", value: profile.stats.replies, icon: "fa-reply" },
  ];

  return (
    <SubPage className="max-w-5xl">
      <div className="w-full">
        <Link
          href="/members"
          className="inline-flex items-center gap-2 text-xs text-[var(--muted)] hover:text-[var(--fg)] transition mb-6"
        >
          <i className="fa-solid fa-arrow-left" aria-hidden="true" /> All members
        </Link>

        {/* Identity header */}
        <div className="member-card flex items-center gap-6 flex-wrap">
          <Avatar
            name={profile.name}
            src={profile.skinUrl}
            size="xl"
            color={profile.color}
            online={profile.online}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-3xl font-bold break-words">{profile.name}</h1>
              <span className={`tag ${profile.online ? "tag-emerald" : "tag-accent"}`}>{profile.role}</span>
              {profile.verified ? (
                <span className="tag tag-accent">
                  <i className="fa-solid fa-circle-check" aria-hidden="true" /> Verified
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              MC · <span className="text-[var(--fg-2)]">{profile.minecraftUsername}</span>
              {profile.joined ? (
                <> · Joined <span className="text-[var(--fg-2)]">{profile.joined}</span></>
              ) : null}
            </p>
            <div
              className={`mt-3 flex items-center gap-2 text-xs uppercase tracking-wider ${
                profile.online ? "text-[var(--emerald)]" : "text-[var(--muted-2)]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full ${
                  profile.online ? "bg-[var(--emerald)]" : "bg-[var(--muted-2)]"
                }`}
              />
              {profile.online ? "In-game right now" : "Offline"}
            </div>
          </div>
        </div>

        {/* Counters */}
        <div className="grid grid-cols-3 gap-4 mt-5">
          {stats.map((s) => (
            <div key={s.label} className="card flex flex-col items-center gap-1 py-5">
              <i className={`fa-solid ${s.icon} text-[var(--accent)] text-sm`} aria-hidden="true" />
              <span className="text-2xl font-semibold">{s.value.toLocaleString("en-US")}</span>
              <span className="text-xs text-[var(--muted)]">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Builds */}
        <section className="mt-10" aria-labelledby="profile-builds">
          <h2 id="profile-builds" className="page-title text-xl mb-4">Builds</h2>
          {profile.gallery.length === 0 ? (
            <EmptyState
              icon="fa-cube"
              title="No builds yet"
              hint="Builds this member posts to the gallery show up here."
            />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {profile.gallery.map((g) => (
                <Link
                  key={g.id}
                  href={`/gallery?item=${g.id}`}
                  className="card overflow-hidden group p-0 hover:border-[var(--border-strong)] transition"
                >
                  <div className="relative aspect-[4/3]">
                    <Image
                      src={g.image}
                      alt={g.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 300px"
                      className="object-cover"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold truncate">{g.title}</h3>
                    <span className="text-xs text-[var(--muted)]">
                      {g.category} · {g.likes} {g.likes === 1 ? "like" : "likes"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Discussions */}
        <section className="mt-10" aria-labelledby="profile-threads">
          <h2 id="profile-threads" className="page-title text-xl mb-4">Discussions</h2>
          {profile.threads.length === 0 ? (
            <EmptyState
              icon="fa-comments"
              title="No discussions yet"
              hint="Threads this member starts show up here."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {profile.threads.map((t) => (
                <Link
                  key={t.id}
                  href={`/forum/${t.id}`}
                  className="card flex items-center gap-4 p-4 hover:border-[var(--border-strong)] transition"
                >
                  <Avatar name={t.author} src={t.avatarUrl} size="sm" color={t.color} />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{t.title}</h3>
                    <span className="text-xs text-[var(--muted)]">
                      {t.category} · {t.replies} {t.replies === 1 ? "reply" : "replies"} ·{" "}
                      <RelativeTime iso={t.last} />
                    </span>
                  </div>
                  <i className="fa-solid fa-arrow-right text-[var(--muted)] text-xs" aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </SubPage>
  );
}
