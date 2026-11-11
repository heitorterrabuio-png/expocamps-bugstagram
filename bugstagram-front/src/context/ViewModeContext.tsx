"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

export type ViewMode = "social" | "lab";

export interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  inspectedPostId: string | null;
  setInspectedPostId: (postId: string | null) => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(
  undefined
);

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>("social");
  const [inspectedPostId, setInspectedPostId] = useState<string | null>(null);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    if (mode === "social") {
      setInspectedPostId(null);
    }
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewModeState((prev) => {
      const next = prev === "social" ? "lab" : "social";
      if (next === "social") {
        setInspectedPostId(null);
      }
      return next;
    });
  }, []);

  return (
    <ViewModeContext.Provider
      value={{
        viewMode,
        setViewMode,
        toggleViewMode,
        inspectedPostId,
        setInspectedPostId,
      }}
    >
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode(): ViewModeContextType {
  const context = useContext(ViewModeContext);
  if (!context) {
    throw new Error(
      "useViewMode deve ser utilizado dentro de um ViewModeProvider"
    );
  }
  return context;
}
