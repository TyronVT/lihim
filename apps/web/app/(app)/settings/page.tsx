import type { Metadata } from "next";
import { SettingsScreen } from "./_components/settings-screen";

export const metadata: Metadata = { title: "Settings" };

/** L10 — Settings (P1, P2, P5). PLACEHOLDER: the account builder replaces SettingsScreen with the full spec. */
export default function SettingsPage() {
  return <SettingsScreen />;
}
