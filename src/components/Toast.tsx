"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ToastState {
  title: string;
  sub?: string;
  variant: "success" | "error";
}

const ToastContext = createContext<{
  show: (title: string, sub?: string, variant?: "success" | "error") => void;
}>({
  show: () => {},
});

// Most error toasts in this codebase start with one of these — detect them
// so a success icon never appears on a failure message.
const ERROR_TITLE_RE = /^(couldn|can't|wrong|failed|not verified|sign in failed|too many|delete[ds]? blocked)/i;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (title: string, sub?: string, variant?: "success" | "error") => {
      const v =
        variant ?? (ERROR_TITLE_RE.test(title.trim()) ? "error" : "success");
      setToast({ title, sub, variant: v });
      if (timer.current) clearTimeout(timer.current);
      // Errors stick around longer — 3s is too fast to read a failure.
      timer.current = setTimeout(() => setToast(null), v === "error" ? 6000 : 3000);
    },
    []
  );

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  // Clear any pending auto-dismiss timer on unmount so it can't fire
  // against a torn-down component (otherwise React 19 warns / leaks).
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const isError = toast?.variant === "error";
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className={`toast ${toast ? "show" : ""} ${isError ? "error" : ""}`}
        role={isError ? "alert" : "status"}
        aria-live="polite"
      >
        <i
          className={`fa-solid ${isError ? "fa-circle-exclamation text-[var(--redstone)]" : "fa-check-circle text-[var(--accent)]"}`}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium">{toast?.title}</div>
          {toast?.sub ? (
            <div className="text-xs text-[var(--muted)]">{toast.sub}</div>
          ) : null}
        </div>
        {toast ? (
          <button className="toast-dismiss" onClick={dismiss} aria-label="Dismiss notification">
            <i className="fa-solid fa-xmark" />
          </button>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}