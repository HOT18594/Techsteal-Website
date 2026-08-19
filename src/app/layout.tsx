import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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

// Minecraft-style pixel font (Minecraftia — the classic free Minecraft clone)
// used for general display text: page titles, nav, stat numbers.
const minecraft = localFont({
  src: "./fonts/Minecraftia-Regular.ttf",
  variable: "--font-pixel",
  display: "swap",
});

// The Minecraft logo font — the bold, blocky "Minecraft" typeface.
// Used for the hero wordmark (and hero kicker) so TECHSTEAL reads like
// the game's logo instead of plain pixel text.
const minecraftLogo = localFont({
  src: "./fonts/Minecraft.ttf",
  variable: "--font-minecraft-logo",
  display: "swap",
});

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
    <html lang="en" className={`${minecraft.variable} ${minecraftLogo.variable} ${grotesk.variable}`}>
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