import type { ReactNode } from "react";

interface SubPageProps {
  children: ReactNode;
  /** Extra classes for the content wrapper (e.g. max-width centering). */
  className?: string;
}

/**
 * Shared shell for subpages.
 *
 * - An invisible top spacer clears the floating wordmark/buttons and keeps
 *   every page starting at the same visual height ("invisible top tile").
 * - The content wrapper centers itself horizontally and fills the remaining
 *   viewport space, so short pages (like /login) can vertically center their
 *   content instead of hugging the top of the page.
 */
export function SubPage({ children, className = "" }: SubPageProps) {
  // Pages can pass their own max-width (e.g. max-w-2xl for a narrow column,
  // max-w-4xl for a thread page). When they do we must NOT also apply the
  // default max-w-7xl on the same element — two competing max-widths is a
  // CSS-order coin flip over which one wins, so narrow pages could widen.
  const hasMaxWidth = /\bmax-w-/.test(className);
  return (
    <section className="flex-1 min-h-0 flex flex-col">
      <div aria-hidden="true" className="h-28 lg:h-32 flex-shrink-0" />
      <div
        className={`flex-1 min-h-0 flex flex-col w-full mx-auto px-6 lg:px-10 pb-16 ${
          hasMaxWidth ? "" : "max-w-7xl"
        } ${className}`}
      >
        {children}
      </div>
    </section>
  );
}
