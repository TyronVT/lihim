"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell, FocusedShell } from "@/components";
import { copy } from "@/lib/copy";
import { signInHref, useSession } from "@/lib/session";

/** Routes in (app) that a signed-out visitor may still see (in the FocusedShell). */
const PUBLIC_IN_APP = new Set(["/privacy"]);

/**
 * Client auth gate (P1). Signed out → `router.replace("/signin?next=<path+query>")`, so push
 * links (/p/…, /g/…, D6) come back after sign-in. While the session loads, gated screens
 * render nothing (no flash of data the visitor can't see); /privacy renders as is.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_IN_APP.has(pathname);
  const signedOut = session.status === "signed-out";

  useEffect(() => {
    if (signedOut && !isPublic) router.replace(signInHref(pathname + window.location.search));
  }, [signedOut, isPublic, pathname, router]);

  if (session.status === "signed-in") return <AppShell>{children}</AppShell>;
  if (isPublic) return signedOut ? <FocusedShell>{children}</FocusedShell> : <>{children}</>;
  return (
    <p role="status" className="sr-only">
      {copy.common.loading}
    </p>
  );
}
