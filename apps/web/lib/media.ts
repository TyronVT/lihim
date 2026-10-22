"use client";

import { useSyncExternalStore } from "react";

/** Breakpoints (lihim-UIUX-SPEC.md §3), same as Tailwind's md / lg / xl. */
export const MEDIA = {
  /** Medium and up: sheets become centred dialogs, 560 column. */
  md: "(min-width: 768px)",
  /** Expanded: desktop shell (sidebar, page header, no pinned footer). */
  lg: "(min-width: 1024px)",
  /** Wide: right rail beside the main column. */
  xl: "(min-width: 1280px)",
} as const;

/**
 * Live `matchMedia` result. false on the server and on the first client render, so use it
 * for behaviour (what to fetch, where a toast goes), not for layout — layout stays in CSS
 * (`lg:` classes) so there's no flash.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
