"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_PALETTE, isPaletteId, PALETTE_STORAGE_KEY, type PaletteId } from "@/lib/palettes";

interface PaletteState {
  palette: PaletteId;
  setPalette: (palette: PaletteId) => void;
  saved: boolean;
}
const PaletteContext = createContext<PaletteState | null>(null);

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [palette, updatePalette] = useState<PaletteId>(DEFAULT_PALETTE);
  const [saved, setSaved] = useState(true);
  const apply = useCallback((next: PaletteId) => {
    document.documentElement.dataset.palette = next;
    updatePalette(next);
  }, []);

  useEffect(() => {
    const current = document.documentElement.dataset.palette;
    if (isPaletteId(current)) updatePalette(current);
    const onStorage = (event: StorageEvent) => {
      if (event.key === PALETTE_STORAGE_KEY || event.key === null) {
        apply(isPaletteId(event.newValue) ? event.newValue : DEFAULT_PALETTE);
        setSaved(true);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [apply]);

  const setPalette = useCallback((next: PaletteId) => {
    if (!isPaletteId(next)) return;
    apply(next);
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, next);
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [apply]);

  const value = useMemo(() => ({ palette, setPalette, saved }), [palette, setPalette, saved]);
  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
}

export function usePalette() {
  const context = useContext(PaletteContext);
  if (!context) throw new Error("usePalette must be used inside PaletteProvider");
  return context;
}
