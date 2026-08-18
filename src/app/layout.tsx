import type { Metadata, Viewport } from "next";
import { Pixelify_Sans, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { BackToTop } from "@/components/BackToTop";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { ToastProvider } from "@/components/Toast";
import { siteConfig } from "@/lib/site";
import "./globals.css";

const pixelify = Pixelify_Sans({
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${siteConfig.name} — Private Minecraft Server`,
  description: `Official website for the ${siteConfig.name} private Minecraft server.`,
};

export const viewport: Viewport = {
  themeColor: "#060a14",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${pixelify.variable} ${grotesk.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body className="antialiased">
        <ToastProvider>
          <Navbar />
          <main>{children}</main>
          <Footer />
          <BackToTop />
        </ToastProvider>
      </body>
    </html>
  );
}