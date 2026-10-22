import { AppGate } from "./_shell/app-gate";

/**
 * Signed-in screens: Home, L1, L3–L7, L8, L10 (lihim-UIUX-SPEC.md §4). The client gate sends a
 * signed-out visitor to /signin?next=<path> (except /privacy, which then renders in the
 * FocusedShell) and wraps everything else in the AppShell (sidebar at ≥ lg).
 */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppGate>{children}</AppGate>;
}
