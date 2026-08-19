import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { BackToTop } from "@/components/BackToTop";
import { CursorFx } from "@/components/CursorFx";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { OnboardingReminder } from "@/components/OnboardingReminder";
import { PageEnter } from "@/components/PageEnter";
import { RevealObserver } from "@/components/RevealObserver";
import { ScrollFx } from "@/components/ScrollFx";
import { ToastProvider } from "@/components/Toast";
import { siteConfig } from "@/lib/site";
import "./globals.css";

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
  title: "Techsteal",
  description: `Official website for the ${siteConfig.name} private Minecraft server.`,
};

export const viewport: Viewport = {
  themeColor: "#060a14",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={grotesk.variable}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body className="antialiased min-h-screen flex flex-col">
        <ToastProvider>
          <RevealObserver />
          <ScrollFx />
          <CursorFx />
          <Navbar />
          <OnboardingReminder />
          <main className="flex-1 flex flex-col">
            <PageEnter>{children}</PageEnter>
          </main>
          <Footer />
          <BackToTop />
        </ToastProvider>
      </body>
    </html>
  );
}