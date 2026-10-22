"use client";

import { Share2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, Icon, Notice, Sheet, Skeleton, notify } from "@/components";
import { copy } from "@/lib/copy";
import { repo, type Invite } from "@/lib/data";
import { formatWhen } from "@/lib/format";

export interface InviteSheetProps {
  groupId: string;
  groupName: string;
  /** Element that opens the sheet (a Button). */
  trigger: ReactNode;
}

const absoluteUrl = (path: string) => (typeof window === "undefined" ? path : new URL(path, window.location.origin).toString());

/**
 * Admin-only invite link sheet (L3 action row, L4 footer, L5 blocked card).
 * A fresh link is minted the first time the sheet opens and reused while the screen lives.
 *
 * TODO(M0): blind joins — decide whether invites become one-time tokens redeemed through
 * the relay so the server never pairs user ↔ commitment (lihim-SPEC.md → Open questions).
 */
export function InviteSheet({ groupId, groupName, trigger }: InviteSheetProps) {
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [failed, setFailed] = useState(false);
  const [canShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");

  const mint = () => {
    setFailed(false);
    repo.createInvite(groupId).then(setInvite, () => setFailed(true));
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !invite) mint();
  };

  const url = invite ? absoluteUrl(invite.url) : "";

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

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title={copy.invite.title}
      description={copy.invite.body(groupName)}
      footer={
        invite && (
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
        )
      }
    >
      <div aria-live="polite" className="flex flex-col gap-3">
        {failed ? (
          <Notice
            tone="danger"
            title={copy.invite.failed}
            action={
              <Button variant="secondary" onClick={mint}>
                {copy.common.retry}
              </Button>
            }
          />
        ) : !invite ? (
          <div className="flex flex-col gap-2">
            <span className="text-label text-text-2">{copy.invite.making}</span>
            <Skeleton className="h-12" />
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-2">
              <span className="text-label text-text-2">{copy.invite.linkLabel}</span>
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="h-12 w-full rounded-sm border border-border-control bg-surface-raised px-3 font-mono text-mono text-text-1"
              />
            </label>
            <p className="flex items-start gap-2 text-caption text-text-3">
              <Icon icon="invite" size={16} className="mt-px shrink-0" />
              <span>
                {invite.expiresAt ? copy.invite.expires(formatWhen(invite.expiresAt)) : copy.invite.noExpiry}
                {invite.maxUses !== null && ` ${copy.invite.maxUses(invite.maxUses)}`}
              </span>
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}
