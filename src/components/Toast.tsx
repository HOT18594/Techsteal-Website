"use client";

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";

type ToastType = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    // Auto remove after 3.5s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  // Listen for legacy global events (for quick migration)
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail) showToast(String(e.detail), "info");
    };
    if (typeof window !== "undefined") {
      window.addEventListener("app-toast" as any, handler);
      return () => window.removeEventListener("app-toast" as any, handler);
    }
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              pointerEvents: "auto",
              minWidth: 220,
              maxWidth: 360,
              padding: "12px 16px",
              borderRadius: 4,
              background: t.type === "error" ? "#2a1a1a" : t.type === "success" ? "#111f14" : "#1a1f22",
              border: `2px solid ${t.type === "error" ? "#e04a39" : t.type === "success" ? "#37d05c" : "#30393e"}`,
              color: t.type === "error" ? "#ff9a8f" : t.type === "success" ? "#37d05c" : "#f3f7ef",
              fontWeight: 700,
              fontSize: 13,
              boxShadow: "0 12px 32px rgba(0,0,0,.45)",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
