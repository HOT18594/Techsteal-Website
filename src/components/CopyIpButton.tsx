"use client";

// One copy-the-server-address button for the whole site (hero, join page,
// status page) — one feedback pattern instead of four.

import { useEffect, useRef, useState } from "react";
import { siteConfig } from "@/lib/site";
import { useToast } from "@/components/Toast";

export function useCopyAddress() {
  const { show } = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(siteConfig.address);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
      show("Server address copied", siteConfig.address);
    } catch {
      show("Couldn't copy address", siteConfig.address, "error");
    }
  };

  return { copied, copy };
}

export function CopyIpButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  const { copied, copy } = useCopyAddress();
  return (
    <button
      className={variant === "primary" ? "btn-primary" : "btn-secondary"}
      onClick={() => void copy()}
      aria-label={`Copy server address ${siteConfig.address}`}
    >
      {copied ? (
        <>
          <i className="fa-solid fa-check" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <i className="fa-solid fa-copy" />
          <span>Copy Address</span>
        </>
      )}
    </button>
  );
}
