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

function getClientSnapshot(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = localStorage.getItem(STORAGE_KEY_DEFAULT);
    if (stored === "light" || stored === "dark") {
      currentThemeState = stored;
      return stored;
    }
  } catch {
    // fallback silencioso
  }
  return currentThemeState;
}

function getServerSnapshot(): "dark" | "light" {
  return "dark";
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
  const resolvedTheme = useSyncExternalStore(
    subscribeTheme,
    getClientSnapshot,
    getServerSnapshot
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

  // Script síncrono anti-FOUC injetado antes da pintura inicial
  const antiFoucScript = `(function(){try{var k=${JSON.stringify(
    storageKey
  )};var d=${JSON.stringify(
    defaultTheme === "system" ? "dark" : defaultTheme
  )};var t=localStorage.getItem(k)||d;var r=document.documentElement;r.classList.remove("light","dark");r.classList.add(t==="light"?"light":"dark");r.style.colorScheme=t==="light"?"light":"dark";}catch(e){}})();`;

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
      <script
        dangerouslySetInnerHTML={{ __html: antiFoucScript }}
        suppressHydrationWarning
      />
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
