import Link from "next/link";
import { siteConfig } from "@/lib/site";
import { CopyrightYear } from "@/components/CopyrightYear";

const NAVIGATE = [
  { href: "/", label: "Home" },
  { href: "/status", label: "Server Status" },
  { href: "/assistant", label: "AI Assistant" },
  { href: "/forum", label: "Forum" },
  { href: "/history", label: "History" },
];

const CONNECT = [
  { href: "/join", label: "How to Join" },
  { href: "/members", label: "Members" },
  { href: "/gallery", label: "Gallery" },
  { href: "/rules", label: "Rules" },
];

const SOCIALS = [
  { key: "discord", label: "Discord", icon: "fa-brands fa-discord" },
  { key: "github", label: "GitHub", icon: "fa-brands fa-github" },
  { key: "wiki", label: "Wiki", icon: "fa-solid fa-book" },
  { key: "map", label: "Map", icon: "fa-solid fa-map-location-dot" },
] as const;

export function Footer() {
  return (
    <footer className="relative py-16 border-t border-[var(--border-strong)]">
      {/* Glow line along the top edge */}
      <div
        aria-hidden="true"
        className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-60"
      />
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <i
                className="fa-solid fa-cube text-2xl text-[var(--accent-bright)]"
                aria-hidden="true"
              />
              <span className="font-display text-2xl tracking-wider text-[var(--fg)]">
                {siteConfig.name}
              </span>
            </div>
            <p className="text-sm text-[var(--muted)] max-w-md mb-6">
              A private Minecraft community — status, builds, history, and
              rules in one place.
            </p>
            {/* Only socials with a real URL render — placeholder "#" links
                would just dead-click to the top of the page. */}
            {SOCIALS.filter((s) => siteConfig.socials[s.key] && siteConfig.socials[s.key] !== "#").length > 0 ? (
              <div className="flex gap-3">
                {SOCIALS.filter((s) => siteConfig.socials[s.key] && siteConfig.socials[s.key] !== "#").map((s) => (
                  <a
                    key={s.key}
                    href={siteConfig.socials[s.key]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 flex items-center justify-center border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:shadow-[0_0_18px_-6px_var(--accent-glow)] transition rounded-lg"
                    aria-label={s.label}
                  >
                    <i className={s.icon} />
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <h4 className="font-display text-sm font-bold uppercase tracking-wider mb-4 text-[var(--accent)]">
              Navigate
            </h4>
            <ul className="space-y-2.5">
              {NAVIGATE.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-[var(--muted)] hover:text-[var(--accent-bright)] transition">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display text-sm font-bold uppercase tracking-wider mb-4 text-[var(--accent)]">
              Connect
            </h4>
            <ul className="space-y-2.5 mb-4">
              {CONNECT.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-[var(--muted)] hover:text-[var(--accent-bright)] transition">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="space-y-1.5">
              <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Address</div>
              <code className="text-sm text-[var(--accent)] font-display">{siteConfig.address}</code>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-[var(--border)] flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-xs text-[var(--muted-2)]">
            © <CopyrightYear /> {siteConfig.name} · Not affiliated with Mojang or Microsoft
          </div>
          <div className="text-xs text-[var(--muted-2)] flex items-center gap-3 flex-wrap justify-center">
            <span className="text-[var(--fg-2)]">{siteConfig.season}</span>
            <span aria-hidden="true">·</span>
            <span>Minecraft {siteConfig.version}</span>
            <span aria-hidden="true">·</span>
            <span>{siteConfig.software}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}