import Link from "next/link";
import { SubPage } from "@/components/SubPage";

export default function NotFound() {
  return (
    <SubPage className="max-w-md">
      <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
        <div className="card p-8 w-full">
          <i className="fa-solid fa-compass text-3xl text-[var(--accent)] mb-4" aria-hidden="true" />
          <h1 className="font-display text-2xl font-bold mb-2">Page not found</h1>
          <p className="text-sm text-[var(--muted)] mb-6">
            This page doesn&apos;t exist — it may have moved, or the address has a typo.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/" className="btn-primary">
              <i className="fa-solid fa-house" aria-hidden="true" />
              Back home
            </Link>
            <Link href="/status" className="btn-secondary">Server status</Link>
            <Link href="/forum" className="btn-secondary">Forum</Link>
          </div>
        </div>
      </div>
    </SubPage>
  );
}