import type { Metadata } from "next";
import { Suspense } from "react";
import { RSS_ALTERNATE_TYPES } from "@/app/shared-metadata";
import { SubPage } from "@/components/SubPage";
import { siteConfig } from "@/lib/site";
import { GalleryClient } from "./GalleryClient";

export const metadata: Metadata = {
  title: "Gallery",
  description: `Community builds, bases, farms, and contraptions from the ${siteConfig.name} Minecraft server.`,
  // The lightbox is URL state (`?item=…`); canonicalize those variants to the
  // gallery itself. Re-declare the layout's RSS alternate or it is dropped
  // (metadata objects are shallow-merged, not merged field by field).
  alternates: {
    canonical: "/gallery",
    types: RSS_ALTERNATE_TYPES,
  },
};

function GallerySkeleton() {
  return (
    <SubPage>
      <div className="w-full">
        <div className="page-header rowed mb-6 gap-4">
          <h1 className="page-title">Gallery</h1>
        </div>
        <div className="gallery-grid" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="gallery-item aspect-[4/3] animate-pulse"
              style={{ cursor: "default" }}
            />
          ))}
        </div>
      </div>
    </SubPage>
  );
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<GallerySkeleton />}>
      <GalleryClient />
    </Suspense>
  );
}
