import { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: `${siteConfig.name} — Private Minecraft Server`,
  description: `Official website for the ${siteConfig.name} private Minecraft server.`,
};

export default function Home() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-6 lg:px-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(59,130,246,0.08)_0%,transparent_60%),radial-gradient(ellipse_60%_40%_at_80%_30%,rgba(34,211,238,0.05)_0%,transparent_60%),radial-gradient(ellipse_50%_50%_at_20%_80%,rgba(59,130,246,0.06)_0%,transparent_60%)] z-0" aria-hidden="true" />

        <div className="relative z-10 max-w-7xl mx-auto w-full">
          <div className="text-center space-y-8 md:space-y-12">
            {/* Logo */}
            <div className="reveal">
              <div className="inline-flex items-center justify-center w-24 h-24 mx-auto mb-6 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] shadow-[0_0_40px_var(--accent-glow)]">
                <div className="relative w-16 h-16 bg-[var(--bg)] rounded-lg">
                  <div className="absolute inset-4 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] rounded" />
                </div>
              </div>
              <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-[var(--fg)]">
                {siteConfig.name}
              </h1>
              <p className="text-lg md:text-xl text-[var(--muted)] max-w-2xl mx-auto mt-4 font-light">
                A private Minecraft server for friends. Built block by block.
              </p>
            </div>

            {/* Hero Asset Slot - Full width banner/video placeholder */}
            <div className="reveal reveal-delay-1">
              <div className="aspect-video max-w-5xl mx-auto rounded-2xl overflow-hidden">
                <div className="asset-placeholder w-full h-full">
                  <div className="asset-placeholder-content">
                    <i className="fa-solid fa-image asset-placeholder-icon" />
                    <span className="asset-placeholder-text">Hero Banner / Video</span>
                    <span className="asset-placeholder-hint">16:9 • Drop your asset here</span>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="reveal reveal-delay-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button className="btn-primary w-full sm:w-auto" id="hero-copy-ip">
                <i className="fa-solid fa-play" />
                <span>Join Server</span>
              </button>
              <Link href="/status" className="btn-secondary w-full sm:w-auto justify-center">
                <i className="fa-solid fa-signal" />
                <span>Check Status</span>
              </Link>
            </div>

            {/* Server IP display */}
            <div className="reveal reveal-delay-3 flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
              <i className="fa-solid fa-server text-[var(--accent)]" />
              <code className="font-display text-[var(--accent-bright)] bg-[var(--bg-2)] px-3 py-1 rounded">
                {siteConfig.address}
              </code>
              <button
                className="btn-ghost text-xs"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(siteConfig.address);
                    const btn = document.getElementById("hero-copy-ip");
                    if (btn) {
                      const original = btn.innerHTML;
                      btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Copied!</span>';
                      setTimeout(() => (btn.innerHTML = original), 2000);
                    }
                  } catch {}
                }}
                aria-label="Copy server address"
              >
                <i className="fa-solid fa-copy" />
              </button>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[var(--muted)] text-xs tracking-wider uppercase z-10">
          <span>Scroll</span>
          <i className="fa-solid fa-chevron-down animate-bounce text-[var(--accent)]" />
        </div>
      </section>

      {/* Feature Highlights / Asset Slots */}
      <section className="py-24 lg:py-32 px-6 lg:px-10 bg-[var(--bg-2)]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 reveal">
            <div className="section-label mb-4 inline-block">Features</div>
            <h2 className="font-display text-4xl md:text-5xl font-bold">What makes {siteConfig.name} different</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Feature 1 - Status */}
            <Link href="/status" className="reveal reveal-delay-1 group">
              <div className="card p-8 h-full flex flex-col transition-all duration-300 group-hover:border-[var(--accent)] group-hover:shadow-[0_0_30px_var(--accent-glow)]">
                <div className="w-14 h-14 rounded-xl bg-[var(--accent-dim)] flex items-center justify-center mb-6 group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">
                  <i className="fa-solid fa-signal text-2xl text-[var(--accent)] group-hover:text-white" />
                </div>
                <h3 className="font-display text-xl font-bold mb-2">Live Server Status</h3>
                <p className="text-[var(--muted)] flex-1 mb-6">Real-time player count, TPS, uptime, and connection details.</p>
                <div className="asset-placeholder aspect-square rounded-lg">
                  <div className="asset-placeholder-content">
                    <i className="fa-solid fa-chart-line asset-placeholder-icon" />
                    <span className="asset-placeholder-text">Status Dashboard</span>
                    <span className="asset-placeholder-hint">Add screenshot</span>
                  </div>
                </div>
              </div>
            </Link>

            {/* Feature 2 - Community */}
            <Link href="/members" className="reveal reveal-delay-2 group">
              <div className="card p-8 h-full flex flex-col transition-all duration-300 group-hover:border-[var(--accent)] group-hover:shadow-[0_0_30px_var(--accent-glow)]">
                <div className="w-14 h-14 rounded-xl bg-[var(--accent-dim)] flex items-center justify-center mb-6 group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">
                  <i className="fa-solid fa-users text-2xl text-[var(--accent)] group-hover:text-white" />
                </div>
                <h3 className="font-display text-xl font-bold mb-2">Close Community</h3>
                <p className="text-[var(--muted)] flex-1 mb-6">Eight dedicated players. No randoms. No drama. Just building together.</p>
                <div className="asset-placeholder aspect-square rounded-lg">
                  <div className="asset-placeholder-content">
                    <i className="fa-solid fa-user-group asset-placeholder-icon" />
                    <span className="asset-placeholder-text">Member Spotlight</span>
                    <span className="asset-placeholder-hint">Add group shot</span>
                  </div>
                </div>
              </div>
            </Link>

            {/* Feature 3 - Builds */}
            <Link href="/gallery" className="reveal reveal-delay-3 group">
              <div className="card p-8 h-full flex flex-col transition-all duration-300 group-hover:border-[var(--accent)] group-hover:shadow-[0_0_30px_var(--accent-glow)]">
                <div className="w-14 h-14 rounded-xl bg-[var(--accent-dim)] flex items-center justify-center mb-6 group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">
                  <i className="fa-solid fa-images text-2xl text-[var(--accent)] group-hover:text-white" />
                </div>
                <h3 className="font-display text-xl font-bold mb-2">Epic Builds</h3>
                <p className="text-[var(--muted)] flex-1 mb-6">Monuments, redstone contraptions, and collaborative projects.</p>
                <div className="asset-placeholder aspect-square rounded-lg">
                  <div className="asset-placeholder-content">
                    <i className="fa-solid fa-cube asset-placeholder-icon" />
                    <span className="asset-placeholder-text">Build Showcase</span>
                    <span className="asset-placeholder-hint">Add best build</span>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Quick Links / Navigation Cards */}
      <section className="py-16 lg:py-24 px-6 lg:px-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/assistant" className="reveal card p-6 text-center group">
              <i className="fa-solid fa-robot text-3xl text-[var(--accent)] mb-3 group-hover:text-[var(--accent-bright)] transition-colors" />
              <h3 className="font-display text-lg font-bold mb-1">AI Assistant</h3>
              <p className="text-sm text-[var(--muted)]">Ask NEXUS anything</p>
            </Link>
            <Link href="/forum" className="reveal reveal-delay-1 card p-6 text-center group">
              <i className="fa-solid fa-comments text-3xl text-[var(--accent)] mb-3 group-hover:text-[var(--accent-bright)] transition-colors" />
              <h3 className="font-display text-lg font-bold mb-1">Forum</h3>
              <p className="text-sm text-[var(--muted)]">Discuss & plan</p>
            </Link>
            <Link href="/history" className="reveal reveal-delay-2 card p-6 text-center group">
              <i className="fa-solid fa-clock-rotate-left text-3xl text-[var(--accent)] mb-3 group-hover:text-[var(--accent-bright)] transition-colors" />
              <h3 className="font-display text-lg font-bold mb-1">History</h3>
              <p className="text-sm text-[var(--muted)]">Timeline of events</p>
            </Link>
            <Link href="/rules" className="reveal reveal-delay-3 card p-6 text-center group">
              <i className="fa-solid fa-gavel text-3xl text-[var(--accent)] mb-3 group-hover:text-[var(--accent-bright)] transition-colors" />
              <h3 className="font-display text-lg font-bold mb-1">Rules</h3>
              <p className="text-sm text-[var(--muted)]">The codex</p>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}