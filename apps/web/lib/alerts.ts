"use client";

/**
 * Poll alerts on this device (P2): "New poll in Art Guild", "A poll closes in 2 hours: Art Guild".
 * Every member of a group gets the same alerts (never per-voter; there is no "you haven't
 * voted" path and must not look like there is one).
 *
 * State, as L2's ask card and L10's switch show it:
 *   "unsupported" — this browser can't show notifications (iOS Safari outside the installed app, old browsers)
 *   "blocked"     — the user denied permission; only the browser's site settings can undo it
 *   "off"         — allowed or not asked yet, but alerts are off on this device
 *   "on"          — permission granted and alerts on
 *
 * The post-join ask (L2) is shown ONCE per device: call markAlertsAsked() when the card is
 * answered ("Turn on alerts" or "Not now"); shouldAskForAlerts() is then false for good.
 * Settings keeps the switch.
 *
 * TODO(push): enable() only asks for notification permission. The Web Push subscription
 * (pushManager.subscribe with the VAPID key → insert into push_subscriptions, sent by the
 * `notify` Edge Function, supabase/functions/notify) isn't wired in the web app yet; disable()
 * should delete that row.
 */
import { useSyncExternalStore } from "react";

export type AlertsState = "unsupported" | "blocked" | "off" | "on";

const PREF_KEY = "lihim:alerts:v1";
const ASKED_KEY = "lihim:alerts-asked:v1";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts for this page view only.
  }
}

function supported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Current state on this device. "unsupported" on the server. */
export function getAlertsState(): AlertsState {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && read(PREF_KEY) === "on" ? "on" : "off";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Live alerts state for L2's card and L10's switch. */
export function useAlertsState(): AlertsState {
  return useSyncExternalStore(subscribe, getAlertsState, () => "unsupported" as const);
}

/**
 * "Turn on alerts": asks the browser for permission (must run from a click). Resolves to the
 * resulting state — "blocked" if the user said no in the browser prompt.
 */
export async function enableAlerts(): Promise<AlertsState> {
  if (!supported()) return "unsupported";
  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = Notification.permission;
    }
  }
  if (permission === "granted") write(PREF_KEY, "on");
  // TODO(push): subscribe via the service worker and store it in push_subscriptions (see header).
  emit();
  return getAlertsState();
}

/** L10 switch off. The browser permission stays; Lihim just stops alerting this device. */
export function disableAlerts(): void {
  write(PREF_KEY, "off");
  // TODO(push): unsubscribe and delete this device's push_subscriptions row.
  emit();
}

/** The post-join card was answered on this device (either button). */
export function markAlertsAsked(): void {
  write(ASKED_KEY, "1");
  emit();
}

export function wasAlertsAsked(): boolean {
  return read(ASKED_KEY) === "1";
}

/**
 * Show L2's "Get a heads-up…" card? Only once per device, only when the browser can show
 * alerts, and not when they're already on or blocked.
 */
export function shouldAskForAlerts(): boolean {
  return !wasAlertsAsked() && getAlertsState() === "off";
}
