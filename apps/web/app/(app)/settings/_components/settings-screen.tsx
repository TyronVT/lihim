"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { AppBar, Button, Icon, ListRow, Notice, Screen, Section, ShellHeader, Switch, TextField, ThemeSelect, notify } from "@/components";
import { copy } from "@/lib/copy";
import { disableAlerts, enableAlerts, useAlertsState } from "@/lib/alerts";
import { DISPLAY_NAME_MAX, cleanDisplayName, displayNameError, signOut, updateDisplayName, useSession } from "@/lib/session";
import { LANDING } from "@/lib/routes";

/** Same cap as L0's name field. */

/**
 * L10 — Settings (lihim-UIUX-SPEC.md §5; P1 sign-out, P2 alerts, P5 name, R12 theme, R16 who's
 * signed in). Compact: a list of sections. ≥ lg: app shell, one 560 column, sections as cards.
 * Never anything about which polls you answered. No primary action, so no PinnedFooter.
 */
export function SettingsScreen() {
  const session = useSession();
  const name = session.status === "signed-in" ? session.user.displayName : "";

  return (
    <>
      <AppBar title={copy.settings.title} backHref="/" />
      <Screen
        width="form"
        header={<ShellHeader title={copy.settings.title} context={name ? copy.settings.signedInAs(name) : undefined} />}
      >
        <SettingsSection title={copy.settings.nameTitle}>
          {/* Keyed by the saved name so the field resets if the session's name changes elsewhere. */}
          <NameForm key={name} saved={name} />
        </SettingsSection>

        <SettingsSection title={copy.settings.alertsTitle}>
          <AlertsControl />
        </SettingsSection>

        <SettingsSection title={copy.settings.displayTitle}>
          <ThemeSelect />
        </SettingsSection>

        <SettingsSection title={copy.settings.privacyTitle}>
          <ListRow href="/privacy" title={copy.shell.privacy} leading={<Icon icon="anonymous" className="shrink-0 text-text-2" />} />
        </SettingsSection>

        <SettingsSection title={copy.settings.accountTitle}>
          <AccountControl name={name} />
        </SettingsSection>
      </Screen>
    </>
  );
}

/** Plain section on compact; a card at ≥ lg (spec: "sections as cards"). */
function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Section
      title={title}
      className="lg:rounded-lg lg:border lg:border-border lg:bg-surface lg:p-6 lg:shadow-raised"
    >
      {children}
    </Section>
  );
}

/** "Your name" (P5): field + inline Save. Renames the user on every admin roster. */
function NameForm({ saved }: { saved: string }) {
  const [value, setValue] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = cleanDisplayName(value);
  const unchanged = trimmed === cleanDisplayName(saved);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const invalid = displayNameError(value);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (unchanged) return;
    setBusy(true);
    setError(null);
    try {
      await updateDisplayName(trimmed);
      notify.success(copy.settings.nameSaved);
    } catch {
      setError(copy.settings.nameFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
      <TextField
        label={copy.settings.nameLabel}
        hint={copy.settings.nameHint}
        error={error}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        maxLength={DISPLAY_NAME_MAX}
        autoComplete="name"
        autoCapitalize="words"
        enterKeyHint="done"
      />
      <Button icon="check"
        type="submit"
        variant="secondary"
        block={false}
        className="self-start"
        loading={busy}
        loadingLabel={copy.settings.nameSaving}
        disabled={unchanged}
      >
        {copy.settings.nameSave}
      </Button>
    </form>
  );
}

/**
 * Alerts (P2): the "Poll alerts" switch, or instructions instead when the browser blocks or
 * can't show notifications. Same alerts for every member (lib/alerts.ts).
 */
function AlertsControl() {
  const state = useAlertsState();
  const [busy, setBusy] = useState(false);

  if (state === "unsupported") return <p className="text-body text-text-2">{copy.settings.alertsUnsupported}</p>;
  if (state === "blocked") return <Notice tone="warning" title={copy.settings.alertsSwitch}>{copy.settings.alertsBlocked}</Notice>;

  const onChange = async (on: boolean) => {
    if (!on) {
      disableAlerts();
      return;
    }
    setBusy(true);
    // Runs inside the click, so the browser shows its permission prompt.
    const next = await enableAlerts();
    setBusy(false);
    if (next === "on") notify.success(copy.alerts.turnedOn);
  };

  return (
    <Switch
      checked={state === "on"}
      onCheckedChange={onChange}
      disabled={busy}
      label={
        <span className="flex items-center gap-2">
          <Icon icon="alerts" className="shrink-0 text-text-2" />
          {copy.settings.alertsSwitch}
        </span>
      }
      description={copy.settings.alertsHelp}
    />
  );
}

/** Account (P1, R16): who's signed in, "Sign out" (secondary) and what happens to the passkey. */
function AccountControl({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
      router.replace(LANDING);
    } catch {
      notify.error(copy.errors.generic);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {name && <p className="text-body text-text-1">{copy.settings.signedInAs(name)}</p>}
      <Button icon="signOut" variant="secondary" onClick={onSignOut} loading={busy} loadingLabel={copy.settings.signingOut}>
        {copy.settings.signOut}
      </Button>
      <p className="text-caption text-text-3">{copy.settings.signOutBody}</p>
    </div>
  );
}
