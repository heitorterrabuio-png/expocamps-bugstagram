"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";

export type Theme = "dark" | "light" | "system";

export interface UseThemeProps {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  themes: string[];
}

export interface ThemeProviderProps {
  children: React.ReactNode;
  attribute?: "class" | "data-theme";
  defaultTheme?: Theme;
  enableSystem?: boolean;
  storageKey?: string;
  disableTransitionOnChange?: boolean;
}

const STORAGE_KEY_DEFAULT = "bugstagram-theme";

const ThemeContext = createContext<UseThemeProps | undefined>(undefined);

// Gerenciador de subscrição externa para evitar setState síncrono em useEffect (React 19)
const listeners = new Set<() => void>();
let currentThemeState: "dark" | "light" = "dark";

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribeTheme(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getClientSnapshot(
  storageKey: string,
  fallback: "dark" | "light"
): "dark" | "light" {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark") {
      currentThemeState = stored;
      return stored;
    }
  } catch {
    // fallback silencioso
  }
  return fallback;
}

function applyDomTheme(
  resolved: "dark" | "light",
  attribute: "class" | "data-theme",
  disableTransitionOnChange: boolean
) {
  if (typeof document === "undefined") return;

  let cleanupTransition: (() => void) | undefined;
  if (disableTransitionOnChange) {
    const css = document.createElement("style");
    css.appendChild(
      document.createTextNode(
        `*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}`
      )
    );
    document.head.appendChild(css);
    cleanupTransition = () => {
      void window.getComputedStyle(document.body);
      setTimeout(() => {
        if (document.head.contains(css)) {
          document.head.removeChild(css);
        }
      }, 1);
    };
  }

  const root = document.documentElement;
  if (attribute === "class") {
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
  } else {
    root.setAttribute("data-theme", resolved);
  }
  root.style.colorScheme = resolved;

  cleanupTransition?.();
}

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "dark",
  storageKey = STORAGE_KEY_DEFAULT,
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  const fallbackTheme: "dark" | "light" =
    defaultTheme === "light" ? "light" : "dark";

  const getSnapshot = useCallback(
    () => getClientSnapshot(storageKey, fallbackTheme),
    [storageKey, fallbackTheme]
  );
  const getServer = useCallback(() => fallbackTheme, [fallbackTheme]);

  const resolvedTheme = useSyncExternalStore(
    subscribeTheme,
    getSnapshot,
    getServer
  );

  useEffect(() => {
    applyDomTheme(resolvedTheme, attribute, disableTransitionOnChange);
  }, [resolvedTheme, attribute, disableTransitionOnChange]);

  const setTheme = useCallback(
    (next: Theme) => {
      const target: "dark" | "light" =
        next === "system"
          ? typeof window !== "undefined" &&
            window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark"
          : next;

      currentThemeState = target;
      try {
        localStorage.setItem(storageKey, target);
      } catch {
        // Ignora erro de storage privado
      }
      applyDomTheme(target, attribute, disableTransitionOnChange);
      emitChange();
    },
    [attribute, disableTransitionOnChange, storageKey]
  );

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider
      value={{
        theme: resolvedTheme,
        resolvedTheme,
        setTheme,
        toggleTheme,
        themes: ["light", "dark"],
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): UseThemeProps {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "dark",
      resolvedTheme: "dark",
      setTheme: () => {},
      toggleTheme: () => {},
      themes: ["light", "dark"],
    };
  }
  return ctx;
}
