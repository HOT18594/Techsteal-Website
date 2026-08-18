import { siteConfig } from "@/lib/site";

const NAVIGATE = [
  { href: "/", label: "Home" },
  { href: "/status", label: "Server Status" },
  { href: "/assistant", label: "AI Assistant" },
  { href: "/forum", label: "Forum" },
  { href: "/history", label: "History" },
];

const CONNECT = [
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
    <footer className="py-16 border-t border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="logo-mark" />
              <span className="font-display text-2xl tracking-wider">{siteConfig.name}</span>
            </div>
            <p className="text-[var(--muted)] max-w-md mb-6">
              A private Minecraft server for friends. Built block by block.
            </p>
            <div className="flex gap-3">
              {SOCIALS.map((s) => (
                <a
                  key={s.key}
                  href={siteConfig.socials[s.key]}
                  className="w-10 h-10 flex items-center justify-center border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition rounded-lg"
                  aria-label={s.label}
                >
                  <i className={s.icon} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-display text-sm font-bold uppercase tracking-wider mb-4 text-[var(--accent)]">
              Navigate
            </h4>
            <ul className="space-y-2.5">
              {NAVIGATE.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition">
                    {l.label}
                  </a>
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
                  <a href={l.href} className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition">
                    {l.label}
                  </a>
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
            © 2025 {siteConfig.name} · Not affiliated with Mojang or Microsoft
          </div>
        </div>
      </div>
    </footer>
  );
}