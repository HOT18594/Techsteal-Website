import type { ReactNode } from "react";

/**
 * The one empty/error state for list pages — dashed box, icon, message,
 * optional action (Retry, Clear filters, …). Replaces the four ad-hoc
 * variants that existed per page.
 */
export function EmptyState({
  icon = "fa-inbox",
  title,
  hint,
  action,
  className = "",
}: {
  icon?: string;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-sm text-[var(--muted)] py-14 text-center border border-dashed border-[var(--border)] rounded-xl ${className}`}
    >
      {/* `icon` is the bare FA name (e.g. "fa-inbox") — the fa-solid prefix
          here supplies the font-family + weight; without it the glyph renders
          in the body font as an empty box. */}
      <i className={`fa-solid ${icon} text-3xl text-[var(--muted-2)] mb-3 block`} aria-hidden="true" />
      <div className="text-[var(--fg-2)] font-medium">{title}</div>
      {hint ? <div className="mt-1 text-xs">{hint}</div> : null}
      {action ? <div className="mt-4 flex justify-center gap-3">{action}</div> : null}
    </div>
  );
}

/** The load-failure variant: retry button wired to the page's refetch. */
export function ErrorState({ onRetry, what }: { onRetry: () => void; what: string }) {
  return (
    <EmptyState
      icon="fa-triangle-exclamation"
      title={`Couldn't load the ${what}`}
      hint="Check your connection and try again."
      action={
        <button className="btn-secondary btn-sm" onClick={onRetry}>
          <i className="fa-solid fa-rotate" />
          Retry
        </button>
      }
    />
  );
}
