"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/time";

function staticUtcLabel(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toISOString().slice(0, 10);
}

export function RelativeTime({
  iso,
  className,
}: {
  iso?: string | null;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!iso) return null;

  const parsed = new Date(iso);
  const dateTime = Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  const label = mounted ? timeAgo(iso) : staticUtcLabel(iso);

  return (
    <time dateTime={dateTime} className={className} suppressHydrationWarning>
      {label}
    </time>
  );
}
