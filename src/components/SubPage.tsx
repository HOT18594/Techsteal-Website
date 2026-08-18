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
 * - The content wrapper fills the remaining viewport space, so short pages
 *   (like /login) can vertically center their content instead of hugging
 *   the top of the page.
 */
export function SubPage({ children, className = "" }: SubPageProps) {
  return (
    <section className="flex-1 min-h-0 flex flex-col">
      <div aria-hidden="true" className="h-24 lg:h-28 flex-shrink-0" />
      <div
        className={`flex-1 min-h-0 flex flex-col w-full px-6 lg:px-10 ${className}`}
      >
        {children}
      </div>
    </section>
  );
}
