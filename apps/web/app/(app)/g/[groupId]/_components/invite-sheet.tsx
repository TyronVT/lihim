"use client";

import { Share2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, ConfirmSheet, Icon, Notice, Sheet, Skeleton, notify } from "@/components";
import { copy } from "@/lib/copy";
import { repo, type ActiveInvite } from "@/lib/data";
import { formatWhen } from "@/lib/format";

export interface InviteSheetProps {
  groupId: string;
  groupName: string;
  /** Element that opens the sheet (a Button). */
  trigger: ReactNode;
}

const absoluteUrl = (path: string) => (typeof window === "undefined" ? path : new URL(path, window.location.origin).toString());

/**
 * What the sheet shows:
 * - loading / failed: reading (or making) the link;
 * - link: the working link. `url` is null when it was made on another device (Supabase keeps
 *   only a hash), so only "Turn off" and "Make a new link" are offered then;
 * - off: the admin just turned the link off (P3); "Make a new link" is the way on.
 */
type View =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "link"; invite: ActiveInvite }
  | { kind: "off" };

/**
 * Admin-only invite link sheet (L3 action row and header, L4 footer and header, L5 blocked card).
 * Opening it shows the group's working link with its uses and expiry (UC11); only when there is
 * none is a fresh one made. "Turn off this link" (P3) revokes it behind a confirm.
 *
 * TODO(M0): blind joins — decide whether invites become one-time tokens redeemed through
 * the relay so the server never pairs user ↔ commitment (lihim-SPEC.md → Open questions).
 */
export function InviteSheet({ groupId, groupName, trigger }: InviteSheetProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "loading" });
  const [making, setMaking] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [canShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");

  const mint = async () => {
    setMaking(true);
    try {
      const invite = await repo.createInvite(groupId);
      setView({ kind: "link", invite });
    } catch {
      setView({ kind: "failed" });
    } finally {
      setMaking(false);
    }
  };

  // Read the working link; make one only when the group has none.
  const load = async () => {
    setView({ kind: "loading" });
    try {
      const active = await repo.getActiveInvite(groupId);
      if (active) setView({ kind: "link", invite: active });
      else await mint();
    } catch {
      setView({ kind: "failed" });
    }
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // Keep a link already shown; otherwise (first open, failed, turned off) read it again.
    if (next && view.kind !== "link") void load();
  };

  const url = view.kind === "link" && view.invite.url ? absoluteUrl(view.invite.url) : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      notify.success(copy.group.inviteCopied);
    } catch {
      notify.error(copy.common.copyFailed);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: groupName, text: copy.invite.shareText(groupName), url });
    } catch {
      // User dismissed the share sheet — nothing to report.
    }
  };

  const turnOff = async () => {
    if (view.kind !== "link") return;
    try {
      await repo.revokeInvite(view.invite.id);
    } catch (e) {
      notify.error(copy.invite.turnOffFailed);
      throw e; // keeps the confirm open
    }
    setView({ kind: "off" });
  };

  const makeNew = (
    <Button variant={view.kind === "off" ? "primary" : "secondary"} onClick={mint} loading={making} loadingLabel={copy.invite.making}>
      {copy.invite.makeNew}
    </Button>
  );

  const footer =
    view.kind === "off" ? (
      makeNew
    ) : view.kind === "link" && view.invite.url ? (
      <>
        <Button onClick={copyLink}>
          <Icon icon="copy" />
          {copy.invite.copyCta}
        </Button>
        {canShare && (
          <Button variant="secondary" onClick={share}>
            <Icon icon={Share2} />
            {copy.invite.shareCta}
          </Button>
        )}
      </>
    ) : view.kind === "link" ? (
      makeNew
    ) : null;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        trigger={trigger}
        title={copy.invite.title}
        description={copy.invite.body(groupName)}
        footer={footer}
      >
        <div aria-live="polite" className="flex flex-col gap-3">
          {view.kind === "failed" ? (
            <Notice
              tone="danger"
              title={copy.invite.failed}
              action={
                <Button variant="secondary" onClick={load}>
                  {copy.common.retry}
                </Button>
              }
            />
          ) : view.kind === "loading" ? (
            <div className="flex flex-col gap-2">
              <span className="text-label text-text-2">{copy.invite.making}</span>
              <Skeleton className="h-12" />
            </div>
          ) : view.kind === "off" ? (
            <Notice tone="info" icon="invite" title={copy.invite.turnedOff} />
          ) : (
            <LinkDetails invite={view.invite} url={url} onTurnOff={() => setConfirmOff(true)} />
          )}
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title={copy.invite.turnOffTitle}
        body={copy.invite.turnOffBody}
        confirmLabel={copy.invite.turnOffConfirm}
        busyLabel={copy.invite.turningOff}
        destructive
        onConfirm={turnOff}
      />
    </>
  );
}

function LinkDetails({ invite, url, onTurnOff }: { invite: ActiveInvite; url: string; onTurnOff: () => void }) {
  return (
    <>
      {url ? (
        <label className="flex flex-col gap-2">
          <span className="text-label text-text-2">{copy.invite.linkLabel}</span>
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="h-12 w-full rounded-sm border border-border-control bg-surface-raised px-3 font-mono text-mono text-text-1"
          />
        </label>
      ) : (
        <Notice tone="info" icon="invite" title={copy.invite.madeElsewhere} />
      )}
      <p className="flex items-start gap-2 text-caption text-text-3">
        <Icon icon="invite" size={16} className="mt-px shrink-0" />
        <span>
          <span className="tabular">{copy.invite.joined(invite.uses, invite.maxUses)}</span>
          {" · "}
          {invite.expiresAt ? copy.invite.expires(formatWhen(invite.expiresAt)) : copy.invite.noExpiry}
        </span>
      </p>
      <Button variant="ghost" block={false} onClick={onTurnOff} className="-ml-2 self-start px-2 text-danger hover:text-danger">
        {copy.invite.turnOff}
      </Button>
    </>
  );
}
