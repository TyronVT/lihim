"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { repo, type GroupSummary } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";
import { MEDIA, useMediaQuery } from "@/lib/media";
import { rememberLastGroup } from "@/lib/last-group";
import { signInHref, useSession } from "@/lib/session";
import { CountBadge } from "./badges";
import { Button } from "./button";
import { Icon } from "./icons";
import { Skeleton } from "./skeleton";
import { Lockup } from "./wordmark";
import { APP_HOME, LANDING } from "@/lib/routes";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ShellContextValue {
  /** Group the sidebar marks as current: set by useCurrentGroup, else read from /g/[groupId]. */
  currentGroupId: string | null;
  setExplicitGroupId: (id: string | null) => void;
  /** Re-read the sidebar's group list (after create, join, leave). */
  refreshGroups: () => void;
  groupsVersion: number;
}

const ShellContext = createContext<ShellContextValue | null>(null);

/** Shell helpers for screens. Safe outside a shell (no-ops). */
export function useShell() {
  const ctx = useContext(ShellContext);
  return {
    inAppShell: ctx !== null,
    currentGroupId: ctx?.currentGroupId ?? null,
    /** Call after createGroup / redeemInvite / leaveGroup so the sidebar list updates. */
    refreshGroups: ctx?.refreshGroups ?? (() => {}),
  };
}

/**
 * Tell the sidebar which group this screen belongs to when the URL doesn't say (L6/L7 are
 * /p/[pollId]): `useCurrentGroup(poll?.groupId)`. /g/[groupId]/** is detected automatically.
 * Also remembers it as the last-visited group (desktop "/" opens it).
 */
export function useCurrentGroup(groupId: string | null | undefined) {
  const set = useContext(ShellContext)?.setExplicitGroupId;
  useEffect(() => {
    if (!set || !groupId) return;
    set(groupId);
    return () => set(null);
  }, [set, groupId]);
}

function groupIdFromPath(pathname: string): string | null {
  const m = /^\/g\/([^/]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]!) : null;
}

// ---------------------------------------------------------------------------
// AppShell (signed in: Home, L1, L3–L7, L8 signed in, L10)
// ---------------------------------------------------------------------------

/** "Skip to content" — first tab stop; jumps past the sidebar / top bar to <main id="main">. */
function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only rounded-md bg-surface-raised px-4 py-3 text-label text-text-1 shadow-raised focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
    >
      {copy.shell.skipToContent}
    </a>
  );
}

/**
 * Signed-in shell (lihim-UIUX-SPEC.md §3). Below lg it adds nothing (today's mobile chrome
 * stays). At ≥ lg: fixed 264 px sidebar (nav landmark) and the page beside it; the window
 * scrolls the page while the sidebar stays put. Mounted by app/(app)/layout.tsx.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [explicitGroupId, setExplicitGroupId] = useState<string | null>(null);
  const [groupsVersion, setGroupsVersion] = useState(0);
  const refreshGroups = useCallback(() => setGroupsVersion((v) => v + 1), []);
  const currentGroupId = explicitGroupId ?? groupIdFromPath(pathname);

  useEffect(() => {
    if (currentGroupId) rememberLastGroup(currentGroupId);
  }, [currentGroupId]);

  const value = useMemo(
    () => ({ currentGroupId, setExplicitGroupId, refreshGroups, groupsVersion }),
    [currentGroupId, refreshGroups, groupsVersion],
  );

  return (
    <ShellContext.Provider value={value}>
      <div data-shell="app">
        <SkipLink />
        <div className="fixed inset-y-0 left-0 z-30 hidden w-sidebar lg:block">
          <Sidebar />
        </div>
        <div className="lg:pl-sidebar">{children}</div>
      </div>
    </ShellContext.Provider>
  );
}

const sidebarItem =
  "relative flex min-h-11 items-center gap-3 rounded-md px-3 text-label text-text-2 transition-colors duration-fast " +
  "hover:bg-surface-raised hover:text-text-1 [&[aria-current]]:bg-surface [&[aria-current]]:text-text-1";

/**
 * Lockup, "Your groups" (open-poll badges, current group marked with a 2 px --accent bar and
 * aria-current), "New group", then "Who can see what", "Settings" and the signed-in name.
 * Replaces Home's list and L3's switcher at ≥ lg. Only fetches at ≥ lg.
 */
export function Sidebar() {
  const ctx = useContext(ShellContext);
  const pathname = usePathname();
  const desktop = useMediaQuery(MEDIA.lg);
  const session = useSession();

  return (
    <nav aria-label={copy.shell.sidebarLabel} className="flex h-dvh flex-col border-r border-border bg-bg">
      <div className="px-4 pt-5 pb-4">
        <Link href={APP_HOME} aria-label={copy.shell.homeLink} className="inline-flex rounded-md">
          <Lockup markSize={32} />
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
        <h2 className="flex items-center gap-2 px-3 pt-2 pb-1 text-overline text-text-3 uppercase">
          <Icon icon="groups" size={16} />
          {copy.shell.yourGroups}
        </h2>
        {desktop ? (
          <SidebarGroups currentGroupId={ctx?.currentGroupId ?? null} pathname={pathname} version={ctx?.groupsVersion ?? 0} />
        ) : null}
        <Link href="/groups/new" className={sidebarItem} aria-current={pathname === "/groups/new" ? "page" : undefined}>
          <Icon icon="createGroup" className="shrink-0" />
          {copy.shell.newGroup}
        </Link>
      </div>

      <div className="flex flex-col gap-0.5 border-t border-border px-3 pt-3 pb-4">
        <Link href="/privacy" className={sidebarItem} aria-current={pathname === "/privacy" ? "page" : undefined}>
          <Icon icon="anonymous" className="shrink-0" />
          {copy.shell.privacy}
        </Link>
        <Link href="/settings" className={sidebarItem} aria-current={pathname === "/settings" ? "page" : undefined}>
          <Icon icon="settings" className="shrink-0" />
          {copy.shell.settings}
        </Link>
        {session.status === "signed-in" && session.user.displayName && (
          <p className="truncate px-3 pt-2 text-caption text-text-3">
            <span className="sr-only">{copy.shell.signedInAs(session.user.displayName)}</span>
            <span aria-hidden>{session.user.displayName}</span>
          </p>
        )}
      </div>
    </nav>
  );
}

function SidebarGroups({ currentGroupId, pathname, version }: { currentGroupId: string | null; pathname: string; version: number }) {
  const groups = useQuery(() => repo.listMyGroups(), [version]);
  const { reload } = groups;
  // A group we don't list yet (just created or joined): re-read once.
  const missing = groups.status === "success" && currentGroupId !== null && !groups.data.some((g) => g.id === currentGroupId);
  useEffect(() => {
    if (missing) reload();
  }, [missing, reload]);

  if (groups.status === "loading")
    return (
      <div role="status" className="flex flex-col gap-1 px-1">
        <span className="sr-only">{copy.common.loading}</span>
        <Skeleton className="h-11 rounded-md" />
        <Skeleton className="h-11 rounded-md" />
      </div>
    );
  if (groups.status === "error")
    return (
      <div className="flex flex-col gap-2 px-3 py-2">
        <p className="text-caption text-text-2">{copy.shell.groupsFailed}</p>
        <Button variant="ghost" block={false} className="self-start px-0" onClick={reload}>
          {copy.common.retry}
        </Button>
      </div>
    );
  if (groups.data.length === 0) return <p className="px-3 py-2 text-caption text-text-3">{copy.shell.noGroups}</p>;

  return (
    <ul className="flex flex-col gap-0.5">
      {groups.data.map((g) => (
        <li key={g.id}>
          <SidebarGroupLink group={g} current={g.id === currentGroupId} exact={pathname === `/g/${g.id}`} />
        </li>
      ))}
    </ul>
  );
}

function SidebarGroupLink({ group, current, exact }: { group: GroupSummary; current: boolean; exact: boolean }) {
  return (
    <Link
      href={`/g/${encodeURIComponent(group.id)}`}
      // "page" on the group home itself; "true" while on one of its child pages (members, a poll…).
      aria-current={current ? (exact ? "page" : "true") : undefined}
      className={cn(
        sidebarItem,
        // The 2 px --accent bar on the current group.
        "[&[aria-current]]:before:absolute [&[aria-current]]:before:inset-y-2 [&[aria-current]]:before:left-0 [&[aria-current]]:before:w-0.5 [&[aria-current]]:before:rounded-full [&[aria-current]]:before:bg-accent",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{group.name}</span>
      {group.openPollsCount > 0 && <CountBadge count={group.openPollsCount} label={copy.shell.openPollsBadge(group.openPollsCount)} />}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// FocusedShell (public or pre-account: L0, L2, L8 signed out, L9)
// ---------------------------------------------------------------------------

/**
 * Top bar: Lockup, "Who can see what", and "Sign in" (signed out) or "Your groups" (signed in).
 * FocusedShell shows it at ≥ lg; a compact screen that wants it (L9, R8) renders
 * `<FocusedTopBar className="lg:hidden" />` itself instead of an AppBar.
 */
export function FocusedTopBar({ className }: { className?: string }) {
  const pathname = usePathname();
  const session = useSession();
  const signedIn = session.status === "signed-in";
  return (
    <header className={cn("sticky top-0 z-30 border-b border-border bg-bg pt-[env(safe-area-inset-top)]", className)}>
      <div className="mx-auto flex h-16 w-full items-center gap-2 px-gutter lg:px-8">
        <Link href={signedIn ? APP_HOME : LANDING} aria-label={copy.shell.homeLink} className="inline-flex shrink-0 rounded-md">
          <Lockup markSize={32} />
        </Link>
        <nav aria-label={copy.shell.footerLabel} className="ml-auto flex items-center gap-1">
          <Link
            href="/privacy"
            aria-current={pathname === "/privacy" ? "page" : undefined}
            className="inline-flex min-h-12 items-center gap-2 rounded-md px-3 text-label text-text-2 transition-colors duration-fast hover:text-text-1"
          >
            <Icon icon="anonymous" className="shrink-0" />
            {/* Icon-only below sm so the bar fits 360 px; the words stay for screen readers. */}
            <span className="sr-only sm:not-sr-only">{copy.shell.privacy}</span>
          </Link>
          {pathname !== "/signin" && session.status !== "loading" && (
            <Button asChild variant="secondary" block={false} className="px-4" icon={signedIn ? "groups" : "passkey"}>
              <Link href={signedIn ? APP_HOME : signInHref(pathname)}>{signedIn ? copy.shell.groupsHome : copy.shell.signIn}</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}

/**
 * No sidebar, so nothing suggests the visitor is inside someone's account. Content is the
 * page's own Screen (use `width="form"` for 560; L9 `wide` for 960). Mounted by
 * app/(public)/layout.tsx, and by the auth gate for /privacy when signed out.
 */
export function FocusedShell({ children }: { children: ReactNode }) {
  return (
    <div data-shell="focused">
      <SkipLink />
      <FocusedTopBar className="hidden lg:block" />
      {children}
    </div>
  );
}
