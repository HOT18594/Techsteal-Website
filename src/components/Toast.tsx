"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ToastState {
  title: string;
  sub?: string;
}

const ToastContext = createContext<{ show: (title: string, sub?: string) => void }>({
  show: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((title: string, sub?: string) => {
    setToast({ title, sub });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        <i className="fa-solid fa-check-circle text-[var(--accent)]" />
        <div>
          <div className="text-sm font-medium">{toast?.title}</div>
          {toast?.sub ? (
            <div className="text-xs text-[var(--muted)]">{toast.sub}</div>
          ) : null}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}