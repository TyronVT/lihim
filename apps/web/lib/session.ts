"use client";

/**
 * The signed-in user, shared by the auth gate (app/(app)/layout.tsx), the sidebar, the focused
 * shell's "Sign in / Your groups" link and the screens (P1).
 *
 * Screens change the session ONLY through the wrappers below (never repo.signIn & co directly),
 * so every subscriber updates at once:
 *
 *   const session = useSession();            // { status: "loading" | "signed-in" | "signed-out", user }
 *   await signIn();                          // L0 "Sign in with passkey"
 *   await signUp(name);                      // L0 / L2 new account (name asked once, P5)
 *   await signOut();                         // L10
 *   await updateDisplayName(name);           // L10 "Your name"
 *
 * Name fields (L0, L2, L10) share DISPLAY_NAME_MAX and displayNameError(); the wrappers trim and
 * cap the name again before it reaches the repo.
 *
 * Errors pass through unchanged (PasskeyCancelledError etc., lib/data/errors.ts).
 * The first useSession() call loads the user once per tab; refreshSession() re-reads it.
 */
import { useEffect, useSyncExternalStore } from "react";
import { copy } from "./copy";
import { repo, type CurrentUser } from "./data";
import { APP_HOME, LANDING } from "@/lib/routes";

/** Longest display name (same cap as a group name, L1). */
export const DISPLAY_NAME_MAX = 60;

/** Trimmed and capped: what the repo stores. */
export function cleanDisplayName(raw: string): string {
  return raw.trim().slice(0, DISPLAY_NAME_MAX);
}

/** Inline error for a name field, or null when the name is fine. */
export function displayNameError(raw: string): string | null {
  return cleanDisplayName(raw) ? null : copy.signin.nameRequired;
}

export type SessionState =
  | { status: "loading"; user: null }
  | { status: "signed-in"; user: CurrentUser }
  | { status: "signed-out"; user: null };

const LOADING: SessionState = { status: "loading", user: null };

let state: SessionState = LOADING;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: SessionState) {
  state = next;
  listeners.forEach((l) => l());
}

const fromUser = (user: CurrentUser | null): SessionState =>
  user ? { status: "signed-in", user } : { status: "signed-out", user: null };

/** Re-read the current user (e.g. after another tab signed out). Keeps the old state visible meanwhile. */
export function refreshSession(): Promise<void> {
  loading = repo.getCurrentUser().then(
    (user) => set(fromUser(user)),
    // Can't tell (offline, misconfigured): treat as signed out so the gate offers sign-in.
    () => set({ status: "signed-out", user: null }),
  );
  return loading;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Current session. "loading" on the server and until the first read resolves. */
export function useSession(): SessionState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => LOADING);
  useEffect(() => {
    if (!loading) void refreshSession();
  }, []);
  return snapshot;
}

export async function signIn(): Promise<CurrentUser> {
  const user = await repo.signIn();
  set(fromUser(user));
  return user;
}

export async function signUp(displayName: string): Promise<CurrentUser> {
  const user = await repo.signUp(cleanDisplayName(displayName));
  set(fromUser(user));
  return user;
}

export async function signOut(): Promise<void> {
  await repo.signOut();
  set({ status: "signed-out", user: null });
}

export async function updateDisplayName(displayName: string): Promise<CurrentUser> {
  const user = await repo.updateDisplayName(cleanDisplayName(displayName));
  set(fromUser(user));
  return user;
}

/**
 * Where L0 sends the user after signing in: `?next=` when it is a same-site path, else APP_HOME.
 * Rejects absolute and protocol-relative URLs (open-redirect guard).
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return APP_HOME;
  return next;
}

/** "/signin?next=<path>" for the auth gate (P1: "→ L0, then back"). */
export function signInHref(next?: string): string {
  return next && next !== APP_HOME && next !== LANDING ? `/signin?next=${encodeURIComponent(next)}` : "/signin";
}
