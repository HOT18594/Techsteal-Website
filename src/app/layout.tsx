import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { BackToTop } from "@/components/BackToTop";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { OnboardingReminder } from "@/components/OnboardingReminder";
import { PageEnter } from "@/components/PageEnter";
import { PollAnnouncement } from "@/components/PollAnnouncement";
import { RevealObserver } from "@/components/RevealObserver";
import { ToastProvider } from "@/components/Toast";
import { PaletteProvider } from "@/components/PaletteProvider";
import { paletteBootstrap } from "@/lib/palettes";
import { getSiteUrl, siteConfig } from "@/lib/site";
import { RSS_ALTERNATE_TYPES, SHARE_IMAGES } from "./shared-metadata";
// Self-hosted Font Awesome: the old cdnjs <link> was render-blocking, so on
// networks that block or blackhole the CDN every page stayed blank until the
// request timed out. Bundled CSS + webfonts remove the third-party dependency.
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./globals.css";
import "./palettes.css";

// The two Minecraft fonts are self-hosted in public/fonts and wired up via
// @font-face in globals.css (`--font-pixel` and `--font-minecraft-logo`).
// Minecraftia's built-in metrics put every glyph ~37.5% of em-size above the
// line box's optical center (the font's metrics report phantom space under
// the glyphs that doesn't exist), so globals.css overrides ascent/descent to
// optically center it — see the @font-face rule there.

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Techsteal",
    template: "%s · Techsteal",
  },
  description: `Official website for the ${siteConfig.name} private Minecraft server — ${siteConfig.season} is ${siteConfig.seasonLive ? "live" : "coming soon"}. Status, forum, members, gallery, and rules.`,
  openGraph: {
    title: "Techsteal",
    siteName: siteConfig.name,
    description: `Status, forum, members, gallery, and rules for the ${siteConfig.name} Minecraft server.`,
    type: "website",
    images: SHARE_IMAGES,
  },
  twitter: {
    card: "summary_large_image",
    title: "Techsteal",
    description: `Status, forum, members, gallery, and rules for the ${siteConfig.name} Minecraft server.`,
    images: SHARE_IMAGES,
  },
  alternates: {
    types: RSS_ALTERNATE_TYPES,
  },
};

export const viewport: Viewport = {
  themeColor: "#191919",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={grotesk.variable} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: paletteBootstrap }} />
      </head>
      <body className="antialiased min-h-screen flex flex-col">
        <noscript>
          <div className="noscript-banner">
            JavaScript is turned off — sign-in, the forum, and live status need it.
            Enable JavaScript for the full experience.
          </div>
        </noscript>
        <PaletteProvider><ToastProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2.5 focus:rounded-[10px] focus:bg-[var(--accent)] focus:text-[var(--bg)] focus:text-xs focus:font-bold"
          >
            Skip to main content
          </a>
          <RevealObserver />
          <Navbar />
          <AnnouncementBar />
          <OnboardingReminder />
          <PollAnnouncement />
          <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col outline-none">
            <PageEnter>{children}</PageEnter>
          </main>
          <Footer />
          <BackToTop />
        </ToastProvider></PaletteProvider>
      </body>
    </html>
  );
}
