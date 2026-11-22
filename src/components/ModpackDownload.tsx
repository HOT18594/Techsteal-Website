"use client";

import { siteConfig } from "@/lib/site";

export function ModpackDownload() {
  if (!siteConfig.modpackDownloadUrl) {
    return (
      <span className="btn-primary flex-shrink-0 justify-center opacity-60 cursor-not-allowed" aria-disabled="true">
        <i className="fa-solid fa-clock" aria-hidden="true" />
        Download coming soon
      </span>
    );
  }

  return (
    <a href={siteConfig.modpackDownloadUrl} className="btn-primary flex-shrink-0 justify-center">
      <i className="fa-solid fa-download" aria-hidden="true" />
      Download ZIP
    </a>
  );
}
