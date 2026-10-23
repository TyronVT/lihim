"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  AnonymityBanner,
  AppBar,
  Button,
  Card,
  EmptyState,
  FooterLinks,
  Icon,
  Illustration,
  Notice,
  PinnedFooter,
  Screen,
  Skeleton,
  TextField,
  notify,
  useShell,
} from "@/components";
import { enableAlerts, markAlertsAsked, shouldAskForAlerts } from "@/lib/alerts";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";
import { InviteError, PasskeyNotFoundError, repo, type InvitePreview } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";
import { formatWhen } from "@/lib/format";
import { DISPLAY_NAME_MAX, cleanDisplayName, displayNameError, signIn, signUp, useSession } from "@/lib/session";
import { PasskeyCancelledError, PasskeyUnsupportedError, unlockGroupIdentity } from "./passkey";
import { APP_HOME } from "@/lib/routes";

/** Same cap as L0's name field. */

/**
 * ≥ lg (focused shell): the content becomes one centred 480 card (lihim-UIUX-SPEC.md §5 L2);
 * the preview card inside it flattens so there's no card-in-card. Compact/medium are unchanged.
 */
const LG_CARD =
  "flex flex-col gap-section lg:mx-auto lg:w-full lg:max-w-app lg:rounded-lg lg:border lg:border-border lg:bg-surface lg:p-8 lg:shadow-raised";
const LG_FLAT = "lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none";
/** The primary inside the card at ≥ lg, where the PinnedFooter is gone. */
const LG_PRIMARY = "hidden lg:[[data-shell]_&]:inline-flex";
/** The h1 at ≥ lg (the AppBar's is hidden there); the card's own headings carry it visually. */
const LG_H1 = "sr-only hidden lg:[[data-shell]_&]:block";

type Phase =
  | { kind: "idle" }
  | { kind: "account" }
  | { kind: "passkey" }
  | { kind: "joining" }
  | { kind: "member" }
  | { kind: "joined"; groupId: string }
  | { kind: "failed"; reason: "cancelled" | "unsupported" | "no-passkey" | "invalid" | "error" };

/** Signed out (P1): new here → name + create in the same step; has a passkey → sign in, then join. */
type AccountMode = "create" | "signin";

function failureOf(e: unknown): Extract<Phase, { kind: "failed" }>["reason"] {
  if (e instanceof PasskeyCancelledError) return "cancelled";
  if (e instanceof PasskeyUnsupportedError) return "unsupported";
  if (e instanceof PasskeyNotFoundError) return "no-passkey";
  if (e instanceof InviteError) return "invalid";
  return "error";
}

/**
 * L2 — invite preview → passkey → "You're in" (+ the one-time alerts ask, P2).
 * Signed out, the same button creates the account (name asked once, P5) or signs in first.
 */
export function JoinFlow({ token }: { token: string }) {
  const session = useSession();
  const { refreshGroups } = useShell();
  const preview = useQuery(() => repo.getInvitePreview(token), [token]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const signedIn = session.status === "signed-in";

  const join = async (p: InvitePreview, account?: { mode: AccountMode; name: string }) => {
    try {
      if (account) {
        setPhase({ kind: "account" });
        if (account.mode === "create") await signUp(account.name);
        else await signIn();
        // Signed in now: a returning member may already be in this group.
        const fresh = await repo.getInvitePreview(p.token);
        if (fresh?.alreadyMember) {
          setPhase({ kind: "member" });
          return;
        }
      }
      setPhase({ kind: "passkey" });
      // D1: the identity is derived from the off-chain groups.id (uuid), known before joining.
      await unlockGroupIdentity(p.groupId);
      setPhase({ kind: "joining" });
      const { groupId } = await repo.redeemInvite(p.token);
      refreshGroups();
      setPhase({ kind: "joined", groupId });
    } catch (e) {
      setPhase({ kind: "failed", reason: failureOf(e) });
    }
  };

  if (phase.kind === "joined") return <Joined groupId={phase.groupId} />;

  const loading = preview.status === "loading" || session.status === "loading";
  const invalid =
    preview.status === "success" &&
    (!preview.data || !preview.data.valid || (phase.kind === "failed" && phase.reason === "invalid"));

  return (
    <>
      <AppBar title={copy.join.title} backHref={signedIn ? "/" : undefined} />
      {loading ? (
        <Screen width="form">
          <div role="status" className={cn(LG_CARD, "items-center gap-4")}>
            <span className="sr-only">{copy.common.loading}</span>
            <Skeleton className="size-24" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="hidden h-12 w-full lg:block" />
          </div>
        </Screen>
      ) : preview.status === "error" ? (
        <Screen width="form">
          <h1 className={LG_H1}>{copy.join.title}</h1>
          <Notice
            tone="danger"
            title={copy.errors.generic}
            className="lg:mx-auto lg:w-full lg:max-w-app"
            action={
              <Button variant="secondary" icon="retry" onClick={preview.reload}>
                {copy.common.retry}
              </Button>
            }
          />
        </Screen>
      ) : invalid ? (
        // X1 (R11): no primary. The secondary depends on who's holding the dead link.
        <Screen width="form">
          <div className={LG_CARD}>
            <h1 className={LG_H1}>{copy.join.title}</h1>
            <EmptyState
              illustration="group"
              title={copy.join.invalidInvite}
              body={copy.join.invalidBody}
              action={
                signedIn ? (
                  <Button asChild variant="secondary" icon="groups">
                    <Link href={APP_HOME}>{copy.join.home}</Link>
                  </Button>
                ) : (
                  <Button asChild variant="secondary" icon="anonymous">
                    <Link href="/privacy">{copy.join.whatIsLihim}</Link>
                  </Button>
                )
              }
            />
          </div>
        </Screen>
      ) : (
        <InvitePreviewScreen
          preview={preview.data!}
          phase={phase}
          signedIn={signedIn}
          onJoin={(account) => join(preview.data!, account)}
        />
      )}
    </>
  );
}

function InvitePreviewScreen({
  preview,
  phase,
  signedIn,
  onJoin,
}: {
  preview: InvitePreview;
  phase: Phase;
  signedIn: boolean;
  onJoin: (account?: { mode: AccountMode; name: string }) => void;
}) {
  const [mode, setMode] = useState<AccountMode>("create");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const busy = phase.kind === "account" || phase.kind === "passkey" || phase.kind === "joining";
  const groupHref = `/g/${encodeURIComponent(preview.groupId)}`;
  const busyLabel =
    phase.kind === "joining"
      ? copy.join.joining
      : phase.kind === "account" && mode === "create"
        ? copy.signin.creating
        : copy.join.waitingPasskey;
  // Nobody can be "already in" a group before signing in; the mock answers for Ana regardless.
  const alreadyMember = phase.kind === "member" || (signedIn && preview.alreadyMember);
  const asksName = !signedIn && mode === "create";

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (signedIn) return onJoin();
    if (mode === "signin") return onJoin({ mode, name: "" });
    const invalid = displayNameError(name);
    if (invalid) {
      setNameError(invalid);
      nameRef.current?.focus();
      return;
    }
    const trimmed = cleanDisplayName(name);
    onJoin({ mode, name: trimmed });
  };

  const switchMode = () => {
    setNameError(null);
    setMode((m) => (m === "create" ? "signin" : "create"));
  };

  // The form wraps the name field so Enter submits; the PinnedFooter button targets it by id.
  const formId = "join-form";
  const primary = (className?: string) =>
    alreadyMember ? (
      <Button asChild icon="join" className={className}>
        <Link href={groupHref}>{copy.join.openGroup}</Link>
      </Button>
    ) : (
      <Button
        type="submit"
        form={formId}
        icon={signedIn ? "join" : "passkey"}
        loading={busy}
        loadingLabel={busyLabel}
        className={className}
      >
        {copy.join.cta}
      </Button>
    );

  const failure = phase.kind === "failed" ? phase.reason : null;

  return (
    <>
      <Screen withFooter width="form">
        <div className={LG_CARD}>
          <h1 className={LG_H1}>{copy.join.title}</h1>
          <div className="flex flex-col items-center gap-4 pt-2 lg:pt-0">
            <Illustration name="group" size={96} />
            <p className="text-label text-text-2">{copy.join.invitedTo}</p>
          </div>

          <Card className={cn("flex flex-col gap-3", LG_FLAT)}>
            <h2 className="text-title text-text-1">{preview.groupName}</h2>
            {preview.description && <p className="text-body text-text-2">{preview.description}</p>}
            <ul className="flex flex-col gap-2 border-t border-border pt-3 text-label text-text-2">
              <li className="flex items-center gap-2 text-text-1">
                <Icon icon="members" className="shrink-0 text-text-2" />
                <span className="tabular">{copy.members.count(preview.memberCount)}</span>
              </li>
              <li className="pl-7">{copy.group.createdBy(preview.createdByName)}</li>
              {preview.expiresAt && (
                <li className="flex items-center gap-2">
                  <Icon icon="closing" className="shrink-0" />
                  {copy.join.expires(formatWhen(preview.expiresAt))}
                </li>
              )}
            </ul>
          </Card>

          {alreadyMember ? (
            <Notice tone="info" icon="verified" title={copy.join.alreadyMember} />
          ) : (
            <AnonymityBanner>{copy.anonymity.bannerJoin}</AnonymityBanner>
          )}

          {!alreadyMember && (
            <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4 empty:hidden">
              {asksName && (
                <TextField
                  ref={nameRef}
                  label={copy.signin.nameLabel}
                  hint={copy.signin.nameHint}
                  error={nameError}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  maxLength={DISPLAY_NAME_MAX}
                  autoComplete="name"
                  autoCapitalize="words"
                  enterKeyHint="go"
                  disabled={busy}
                />
              )}
            </form>
          )}

          <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
            {busy && <p className="text-label text-text-2">{busyLabel}</p>}
            {failure === "cancelled" && <Notice tone="warning" title={copy.join.cancelled} />}
            {failure === "unsupported" && <Notice tone="warning" title={copy.join.unsupported} />}
            {failure === "no-passkey" && <Notice tone="warning" title={copy.signin.noPasskey} />}
            {failure === "error" && <Notice tone="danger" title={copy.join.failed} />}
          </div>

          {primary(LG_PRIMARY)}

          {!signedIn && !alreadyMember && (
            <Button variant="ghost" onClick={switchMode} disabled={busy}>
              {mode === "create" ? copy.signin.haveAccount : copy.signin.createAccount}
            </Button>
          )}
        </div>

        <FooterLinks />
      </Screen>
      <PinnedFooter>{primary()}</PinnedFooter>
    </>
  );
}

/** Success: Verified illustration (the one `priority` image on L2) + "You're in" + the alerts ask. */
function Joined({ groupId }: { groupId: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  const primary = (className?: string) => (
    <Button asChild icon="join" className={className}>
      <Link href={`/g/${encodeURIComponent(groupId)}`}>{copy.join.openGroup}</Link>
    </Button>
  );

  return (
    <>
      <AppBar title={copy.join.title} />
      <Screen withFooter width="form">
        <div className={LG_CARD}>
          <div role="status" className="flex animate-rise-in flex-col items-center gap-4 pt-6 text-center lg:pt-0">
            <Illustration name="verified" size={96} priority />
            <h2 ref={heading} tabIndex={-1} className="text-title text-text-1 outline-none">
              {copy.join.joined}
            </h2>
            <p className="text-body text-text-2">{copy.join.joinedBody}</p>
          </div>
          <AlertsAsk />
          {primary(LG_PRIMARY)}
        </div>
        <FooterLinks />
      </Screen>
      <PinnedFooter>{primary()}</PinnedFooter>
    </>
  );
}

/**
 * P2: "Get a heads-up…?" asked once per device, right after a join (never on first launch).
 * Both buttons mark it asked; Settings keeps the switch. Secondary buttons only: "Open group"
 * stays the one primary.
 */
function AlertsAsk() {
  // Read once when the success state mounts (client-only: it renders after a click).
  const [show, setShow] = useState(() => shouldAskForAlerts());
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  if (blocked) return <AlertsCard title={copy.alerts.blocked} />;
  if (!show) return null;

  const turnOn = async () => {
    setBusy(true);
    const state = await enableAlerts();
    markAlertsAsked();
    setBusy(false);
    if (state === "on") {
      notify(copy.alerts.turnedOn);
      setShow(false);
    } else if (state === "blocked") {
      setBlocked(true);
    } else {
      setShow(false);
    }
  };

  const notNow = () => {
    markAlertsAsked();
    setShow(false);
  };

  return (
    <AlertsCard title={copy.alerts.askTitle} body={copy.alerts.askBody}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" icon="alerts" onClick={turnOn} loading={busy} loadingLabel={copy.alerts.turnOn} className="sm:flex-1">
          {copy.alerts.turnOn}
        </Button>
        <Button variant="ghost" onClick={notNow} disabled={busy} className="sm:flex-1">
          {copy.alerts.notNow}
        </Button>
      </div>
    </AlertsCard>
  );
}

function AlertsCard({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 lg:bg-surface-raised lg:shadow-none">
      <div className="flex items-start gap-3">
        <Icon icon="alerts" className="mt-0.5 shrink-0 text-text-2" />
        <div className="flex flex-col gap-1">
          <p className="text-heading text-text-1">{title}</p>
          {body && <p className="text-body text-text-2">{body}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}
