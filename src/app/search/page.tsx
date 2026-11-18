import type { Metadata } from "next";
import { Suspense } from "react";
import { SubPage } from "@/components/SubPage";
import { siteConfig } from "@/lib/site";
import { SearchClient } from "./SearchClient";

export const metadata: Metadata = {
  title: "Search",
  description: `Search discussions, builds and members across ${siteConfig.name}.`,
  robots: { index: false, follow: false },
};

function SearchSkeleton() {
  return (
    <SubPage>
      <div className="w-full" aria-hidden="true">
        <div className="page-header mb-6">
          <h1 className="page-title">Search</h1>
        </div>
        <div className="h-13 max-w-2xl rounded-[10px] bg-[var(--bg-2)] border border-[var(--border)] mb-8 animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-5 flex items-start gap-4 animate-pulse">
              <div className="w-12 h-12 rounded-[10px] bg-white/5 flex-shrink-0" />
              <div className="flex-1">
                <div className="h-4 w-2/3 bg-white/5 rounded mb-2" />
                <div className="h-3 w-1/3 bg-white/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SubPage>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchClient />
    </Suspense>
  );
}
