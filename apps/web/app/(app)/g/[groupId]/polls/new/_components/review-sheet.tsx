"use client";

import type { ReactNode } from "react";
import { Button, Sheet } from "@/components";
import { copy } from "@/lib/copy";
import type { PollKind } from "@/lib/data";

const t = copy.newPoll;

export interface PollReview {
  kind: PollKind;
  title: string;
  /** Single choice: the filled option labels, in order. */
  optionLabels: string[];
  /** Already formatted ("Mon, Oct 26, 6:00 PM"). */
  closesAt: string;
  memberCount: number;
  hideLiveTally: boolean;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0">
      <dt className="text-caption text-text-3">{label}</dt>
      <dd className="text-body text-text-1">{children}</dd>
    </div>
  );
}

/**
 * R7 "Check before opening" (compact, medium and expanded below 1280; at ≥ 1280 the live
 * preview does this job). A poll can't be edited once it's open, so the admin sees exactly
 * what members will get before it's sent. "Edit" just closes the sheet.
 */
export function ReviewSheet({
  open,
  onOpenChange,
  review,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: PollReview;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title={t.reviewTitle}
      description={t.reviewBody}
      footer={
        <>
          <Button icon="openPoll" onClick={onConfirm} loading={busy} loadingLabel={t.opening}>
            {t.openCta}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {t.reviewEdit}
          </Button>
        </>
      }
    >
      <dl className="flex flex-col">
        <Row label={t.question}>
          <span className="break-words">{review.title}</span>
        </Row>
        <Row label={t.options}>
          {review.kind === "single" ? (
            <ol className="flex list-decimal flex-col gap-1 pl-5">
              {review.optionLabels.map((label, i) => (
                <li key={i} className="break-words">
                  {label}
                </li>
              ))}
            </ol>
          ) : (
            <span className="text-text-2">{review.kind === "yesno" ? t.yesNoPreview : t.ratingPreview}</span>
          )}
        </Row>
        <Row label={t.reviewCloses}>{review.closesAt}</Row>
        <Row label={t.reviewWhoLabel}>
          <span className="tabular">{t.reviewWho(review.memberCount)}</span>
        </Row>
        <Row label={t.reviewResults}>{review.hideLiveTally ? t.reviewHidden : t.reviewLive}</Row>
      </dl>
    </Sheet>
  );
}
