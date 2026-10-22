"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, FooterLinks, Lockup, Notice, Screen } from "@/components";
import { copy } from "@/lib/copy";
import { PasskeyCancelledError, PasskeyNotFoundError, PasskeyUnsupportedError } from "@/lib/data";
import { safeNextPath, signIn } from "@/lib/session";

/**
 * PLACEHOLDER for L0 (lihim-UIUX-SPEC.md §5 "L0 Sign in"): just enough for the auth gate's
 * round trip (sign out in mock → /signin → back to ?next=). Missing: new-account step with the
 * name field, ?next= context line, focused-shell card layout.
 */
export function SignInScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
      router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    } catch (e) {
      setError(
        e instanceof PasskeyCancelledError
          ? copy.signin.cancelled
          : e instanceof PasskeyNotFoundError
            ? copy.signin.noPasskey
            : e instanceof PasskeyUnsupportedError
              ? copy.signin.unsupported
              : copy.signin.failed,
      );
      setBusy(false);
    }
  };

  return (
    <Screen width="form" className="pt-10">
      <header className="flex flex-col gap-4">
        <Lockup markSize={64} tagline={copy.brand.tagline} />
        <h1 className="text-title text-text-1">{copy.signin.title}</h1>
      </header>
      {error && <Notice tone="danger" title={error} />}
      <Button onClick={onSignIn} loading={busy} loadingLabel={copy.signin.waiting}>
        {copy.signin.cta}
      </Button>
      <FooterLinks />
    </Screen>
  );
}
