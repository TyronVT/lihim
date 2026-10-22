"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AnonymityBanner,
  AppBar,
  Button,
  Card,
  EmptyState,
  Icon,
  Illustration,
  Notice,
  PinnedFooter,
  Screen,
  Skeleton,
} from "@/components";
import { copy } from "@/lib/copy";
import { InviteError, repo, type InvitePreview } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";
import { formatWhen } from "@/lib/format";
import { PasskeyCancelledError, PasskeyUnsupportedError, unlockGroupIdentity } from "./passkey";

type Phase =
  | { kind: "idle" }
  | { kind: "passkey" }
  | { kind: "joining" }
  | { kind: "joined"; groupId: string }
  | { kind: "failed"; reason: "cancelled" | "unsupported" | "invalid" | "error" };

/** L2 — invite preview → passkey → "You're in". */
export function JoinFlow({ token }: { token: string }) {
  const preview = useQuery(() => repo.getInvitePreview(token), [token]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const join = async (p: InvitePreview) => {
    try {
      setPhase({ kind: "passkey" });
      // D1: the identity is derived from the off-chain groups.id (uuid), known before joining.
      await unlockGroupIdentity(p.groupId);
      setPhase({ kind: "joining" });
      const { groupId } = await repo.redeemInvite(p.token);
      setPhase({ kind: "joined", groupId });
    } catch (e) {
      const reason =
        e instanceof PasskeyCancelledError
          ? "cancelled"
          : e instanceof PasskeyUnsupportedError
            ? "unsupported"
            : e instanceof InviteError
              ? "invalid"
              : "error";
      setPhase({ kind: "failed", reason });
    }
  };

  if (phase.kind === "joined") return <Joined groupId={phase.groupId} />;

  return (
    <>
      <AppBar title={copy.join.title} backHref="/" />
      {preview.status === "loading" ? (
        <Screen>
          <div role="status" className="flex flex-col items-center gap-4">
            <span className="sr-only">{copy.common.loading}</span>
            <Skeleton className="size-24" />
            <Skeleton className="h-40 w-full" />
          </div>
        </Screen>
      ) : preview.status === "error" ? (
        <Screen>
          <Notice
            tone="danger"
            title={copy.errors.generic}
            action={
              <Button variant="secondary" onClick={preview.reload}>
                {copy.common.retry}
              </Button>
            }
          />
        </Screen>
      ) : !preview.data || !preview.data.valid || (phase.kind === "failed" && phase.reason === "invalid") ? (
        <Screen>
          <EmptyState
            illustration="group"
            title={copy.join.invalidInvite}
            body={copy.join.invalidBody}
            action={
              <Button asChild variant="secondary">
                <Link href="/">{copy.join.home}</Link>
              </Button>
            }
          />
        </Screen>
      ) : (
        <InvitePreviewScreen preview={preview.data} phase={phase} onJoin={() => join(preview.data!)} />
      )}
    </>
  );
}

function InvitePreviewScreen({ preview, phase, onJoin }: { preview: InvitePreview; phase: Phase; onJoin: () => void }) {
  const busy = phase.kind === "passkey" || phase.kind === "joining";
  const groupHref = `/g/${encodeURIComponent(preview.groupId)}`;
  const busyLabel = phase.kind === "joining" ? copy.join.joining : copy.join.waitingPasskey;

  return (
    <>
      <Screen withFooter>
        <div className="flex flex-col items-center gap-4 pt-2">
          <Illustration name="group" size={96} />
          <p className="text-label text-text-2">{copy.join.invitedTo}</p>
        </div>

        <Card className="flex flex-col gap-3">
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

        {preview.alreadyMember ? (
          <Notice tone="info" icon="verified" title={copy.join.alreadyMember} />
        ) : (
          <AnonymityBanner>{copy.anonymity.bannerJoin}</AnonymityBanner>
        )}

        <div aria-live="polite" className="empty:hidden">
          {busy && <p className="text-label text-text-2">{busyLabel}</p>}
          {phase.kind === "failed" && phase.reason === "cancelled" && <Notice tone="warning" title={copy.join.cancelled} />}
          {phase.kind === "failed" && phase.reason === "unsupported" && <Notice tone="warning" title={copy.join.unsupported} />}
          {phase.kind === "failed" && phase.reason === "error" && <Notice tone="danger" title={copy.join.failed} />}
        </div>

        <Link
          href="/privacy"
          className="self-start py-3 text-label text-text-2 underline-offset-4 hover:text-text-1 hover:underline"
        >
          {copy.common.privacyLink}
        </Link>
      </Screen>
      <PinnedFooter>
        {preview.alreadyMember ? (
          <Button asChild>
            <Link href={groupHref}>{copy.join.openGroup}</Link>
          </Button>
        ) : (
          <Button onClick={onJoin} loading={busy} loadingLabel={busyLabel}>
            {copy.join.cta}
          </Button>
        )}
      </PinnedFooter>
    </>
  );
}

/** Success: Verified illustration (the one `priority` image on L2) + "You're in". */
function Joined({ groupId }: { groupId: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <>
      <AppBar title={copy.join.title} />
      <Screen withFooter>
        <div role="status" className="flex animate-rise-in flex-col items-center gap-4 pt-6 text-center">
          <Illustration name="verified" size={96} priority />
          <h2 ref={heading} tabIndex={-1} className="text-title text-text-1">
            {copy.join.joined}
          </h2>
          <p className="text-body text-text-2">{copy.join.joinedBody}</p>
        </div>
        <Link
          href="/privacy"
          className="self-center py-3 text-label text-text-2 underline underline-offset-4 hover:text-text-1"
        >
          {copy.common.privacyLink}
        </Link>
      </Screen>
      <PinnedFooter>
        <Button asChild>
          <Link href={`/g/${encodeURIComponent(groupId)}`}>{copy.join.openGroup}</Link>
        </Button>
      </PinnedFooter>
    </>
  );
}
