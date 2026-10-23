"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button, FooterLinks, Lockup, Notice, Screen, TextField } from "@/components";
import { copy } from "@/lib/copy";
import { PasskeyCancelledError, PasskeyNotFoundError, PasskeyUnsupportedError } from "@/lib/data";
import { DISPLAY_NAME_MAX, cleanDisplayName, displayNameError, safeNextPath, signIn, signUp, useSession } from "@/lib/session";
import { APP_HOME } from "@/lib/routes";

/** Same cap as a group name (L1); the roster row has room for it. */

type Mode = "signin" | "create";
type Failure = "cancelled" | "no-passkey" | "unsupported" | "failed";

function failureOf(e: unknown): Failure {
  if (e instanceof PasskeyCancelledError) return "cancelled";
  if (e instanceof PasskeyNotFoundError) return "no-passkey";
  if (e instanceof PasskeyUnsupportedError) return "unsupported";
  return "failed";
}

// ?next= is read straight from the URL (no useSearchParams, so the page needs no Suspense
// boundary); "" on the server, so the context line appears after hydration.
const noSubscribe = () => () => {};
function useNextParam(): string | null {
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => "");
  return new URLSearchParams(search).get("next");
}

/** "Sign in to open this poll." / "…this group." for a gated link (§4 "→ L0, then back"). */
function nextLine(next: string | null): string | null {
  const path = safeNextPath(next);
  if (path === APP_HOME) return null;
  if (path.startsWith("/p/")) return copy.signin.nextPoll;
  if (path.startsWith("/g/")) return copy.signin.nextGroup;
  return copy.signin.nextOther;
}

/**
 * L0 — Sign in (P1, P5; lihim-UIUX-SPEC.md §5). One passkey prompt signs in and unlocks the
 * group identities. "New here?" switches to the new-account step: the name is asked once, then
 * "Continue" runs the same prompt in create mode (signUp takes the name, so it comes first).
 * Compact: the page itself, content on --bg. ≥ lg (focused shell): one centred 440 card.
 * A signed-in visitor is sent on to ?next= (or APP_HOME, /groups).
 */
export function SignInScreen() {
  const router = useRouter();
  const session = useSession();
  const next = useNextParam();
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const switched = useRef(false);

  const signedIn = session.status === "signed-in";
  useEffect(() => {
    if (signedIn) router.replace(safeNextPath(next));
  }, [signedIn, next, router]);

  // Move focus with the step change (not on first render): the name field, or back to the title.
  useEffect(() => {
    if (!switched.current) return;
    if (mode === "create") nameRef.current?.focus();
    else titleRef.current?.focus();
  }, [mode]);

  const switchTo = (m: Mode) => {
    switched.current = true;
    setFailure(null);
    setNameError(null);
    setMode(m);
  };

  const onSignIn = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await signIn();
      // The effect above navigates once the session reads signed-in.
    } catch (e) {
      setFailure(failureOf(e));
      setBusy(false);
    }
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = cleanDisplayName(name);
    const invalid = displayNameError(name);
    if (invalid) {
      setNameError(invalid);
      nameRef.current?.focus();
      return;
    }
    setNameError(null);
    setBusy(true);
    setFailure(null);
    try {
      await signUp(trimmed);
    } catch (err) {
      setFailure(failureOf(err));
      setBusy(false);
    }
  };

  const context = nextLine(next);
  const creating = mode === "create";

  return (
    <Screen width="form" className="pt-10 lg:pt-16">
      <div className="flex flex-col gap-section lg:mx-auto lg:w-full lg:max-w-[440px] lg:rounded-lg lg:border lg:border-border lg:bg-surface lg:p-8 lg:shadow-raised">
        <header className="flex flex-col gap-4">
          <Lockup markSize={64} tagline={copy.brand.tagline} />
          <h1 ref={titleRef} tabIndex={-1} className="text-title text-text-1 outline-none">
            {creating ? copy.signin.createTitle : copy.signin.title}
          </h1>
        </header>

        <div className="flex flex-col gap-4">
          {context && !creating && <p className="text-body text-text-2">{context}</p>}

          <div aria-live="polite" className="empty:hidden">
            {failure === "cancelled" && <p className="text-label text-text-2">{copy.signin.cancelled}</p>}
            {failure === "no-passkey" && <Notice tone="warning" title={copy.signin.noPasskey} />}
            {failure === "unsupported" && <Notice tone="warning" title={copy.signin.unsupported} />}
            {failure === "failed" && <Notice tone="danger" title={copy.signin.failed} />}
          </div>

          {creating ? (
            <form noValidate onSubmit={onCreate} className="flex flex-col gap-4">
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
              <Button type="submit" icon="createAccount" loading={busy} loadingLabel={copy.signin.creating}>
                {copy.signin.continue}
              </Button>
            </form>
          ) : (
            <Button onClick={onSignIn} icon="passkey" loading={busy} loadingLabel={copy.signin.waiting}>
              {copy.signin.cta}
            </Button>
          )}

          <Button variant="ghost" onClick={() => switchTo(creating ? "signin" : "create")} disabled={busy}>
            {creating ? copy.signin.haveAccount : copy.signin.createAccount}
          </Button>
        </div>
      </div>
      <FooterLinks />
    </Screen>
  );
}
