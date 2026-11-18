"use client";

import { useEffect } from "react";
import { paletteBootstrap } from "@/lib/palettes";
// Last-resort boundary for errors in the root layout itself. Must render its
// own <html>/<body> because it replaces the entire document tree.
import "./globals.css";
import "./palettes.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: paletteBootstrap }} />
      </head>
      <body className="antialiased min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="card p-8 max-w-md w-full">
          <h1 className="font-display text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-sm text-[var(--muted)] mb-6">
            The site hit an unexpected error. Reloading usually fixes it.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button type="button" className="btn-primary" onClick={reset}>
              Try again
            </button>
            <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}