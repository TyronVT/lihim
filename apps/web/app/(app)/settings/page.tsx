import type { Metadata } from "next";
import { SettingsScreen } from "./_components/settings-screen";

export const metadata: Metadata = { title: "Settings" };

/** L10 — Settings (P1 sign-out, P2 alerts, P5 name, R12 theme). */
export default function SettingsPage() {
  return <SettingsScreen />;
}
