"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppBar, Button, Screen, Section, ShellHeader, ThemeSelect } from "@/components";
import { copy } from "@/lib/copy";
import { signOut, useSession } from "@/lib/session";

/**
 * PLACEHOLDER for L10 (lihim-UIUX-SPEC.md §5 "L10 Settings"): theme and sign-out only, so the
 * mock sign-out → /signin round trip works. Missing: name, alerts, privacy row, card layout.
 */
export function SettingsScreen() {
  const router = useRouter();
  const session = useSession();
  const [busy, setBusy] = useState(false);

  const onSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
      router.replace("/signin");
    } catch {
      setBusy(false);
    }
  };

  return (
    <>
      <AppBar title={copy.settings.title} backHref="/" />
      <Screen
        width="form"
        header={
          <ShellHeader
            title={copy.settings.title}
            context={session.status === "signed-in" ? copy.settings.signedInAs(session.user.displayName) : undefined}
          />
        }
      >
        <Section title={copy.settings.displayTitle}>
          <ThemeSelect />
        </Section>
        <Section title={copy.settings.accountTitle}>
          <Button variant="secondary" onClick={onSignOut} loading={busy} loadingLabel={copy.settings.signingOut}>
            {copy.settings.signOut}
          </Button>
          <p className="text-caption text-text-3">{copy.settings.signOutBody}</p>
        </Section>
      </Screen>
    </>
  );
}
