"use client";

import { useCallback, useSyncExternalStore } from "react";

/** "system" = follow prefers-color-scheme (no data-theme attribute). */
export type ThemePreference = "system" | "dark" | "light";

export const THEME_STORAGE_KEY = "lihim:theme";

/**
 * Runs in <head> before first paint (see app/layout.tsx) so a stored override never
 * flashes the wrong theme. Kept tiny and dependency-free; mirrors applyTheme().
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage blocked: the attribute still applies for this page view.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Current preference + setter, for a settings control (see components/theme-select.tsx). */
export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void] {
  const pref = useSyncExternalStore(subscribe, readPreference, () => "system" as const);
  const set = useCallback((p: ThemePreference) => applyTheme(p), []);
  return [pref, set];
}
