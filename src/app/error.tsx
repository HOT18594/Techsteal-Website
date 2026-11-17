"use client";

// Route-level error boundary: without it, any render throw unmounts the whole
// React tree to a blank white page with no way back except a manual reload.
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="card p-8 max-w-md w-full">
        <i className="fa-solid fa-triangle-exclamation text-3xl text-[var(--accent)] mb-4" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold mb-2">Something went wrong</h1>
        <p className="text-sm text-[var(--muted)] mb-6">
          This page hit an unexpected error. Trying again usually fixes it.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button className="btn-primary" onClick={reset}>
            <i className="fa-solid fa-rotate-right" aria-hidden="true" />
            Try again
          </button>
          <button className="btn-secondary" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}