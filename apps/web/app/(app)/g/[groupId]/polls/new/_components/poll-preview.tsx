"use client";

import { AnonymityBanner, Card, OptionGroup, RatingRow, StatusPill } from "@/components";
import { copy } from "@/lib/copy";
import type { PollKind, PollOption } from "@/lib/data";
import { cn } from "@/lib/cn";
import { formatClosing } from "@/lib/format";
import { pollDisplayStatus } from "@/lib/poll";

const t = copy.newPoll;
const noop = () => {};

/**
 * L5 "What members will see" (spec §6 PollPreview, R7 on desktop): the L6 header and the real
 * L6 answer components, updated as the admin types. The answer controls are `inert` (no focus,
 * no clicks, out of the accessibility tree); an sr-only list reads the options instead.
 * Rendered at ≥ lg only: beside the form at ≥ 1280, under it at 1024–1279.
 */
export function PollPreview({
  kind,
  title,
  optionLabels,
  closesAt,
  now,
  memberCount,
}: {
  kind: PollKind;
  title: string;
  /** Every option field, in order, empty ones included (shown as "Option n"). */
  optionLabels: string[];
  /** null while the custom time is empty or invalid. */
  closesAt: number | null;
  now: number;
  memberCount: number;
}) {
  const question = title.trim();
  const options: PollOption[] =
    kind === "yesno"
      ? [
          { value: 0, label: copy.vote.yes },
          { value: 1, label: copy.vote.no },
        ]
      : optionLabels.map((label, i) => ({ value: i, label: label.trim() || t.previewOption(i + 1) }));
  const status = closesAt === null ? "open" : pollDisplayStatus({ status: "open", closesAt: new Date(closesAt).toISOString() }, now);

  return (
    <section aria-labelledby="poll-preview-title" className="flex flex-col gap-3">
      <h2 id="poll-preview-title" className="text-overline uppercase text-text-2">
        {t.previewTitle}
      </h2>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={status} />
          {closesAt !== null && <span className="text-caption text-text-2">{formatClosing(closesAt, now)}</span>}
        </div>
        <p className={cn("text-title break-words", question ? "text-text-1" : "text-text-3")}>
          {question || t.questionPlaceholder}
        </p>
        <AnonymityBanner>{copy.anonymity.bannerVote}</AnonymityBanner>
        <p className="text-label text-text-2">{copy.vote.pickThenSend}</p>
        <div inert aria-hidden>
          {kind === "rating" ? (
            <RatingRow value={null} onSelect={noop} label={question || t.question} />
          ) : (
            <OptionGroup options={options} value={null} onSelect={noop} label={question || t.question} />
          )}
        </div>
        {kind === "rating" ? (
          <p className="sr-only">{t.ratingPreview}</p>
        ) : (
          <ol className="sr-only" aria-label={t.options}>
            {options.map((o) => (
              <li key={o.value}>{o.label}</li>
            ))}
          </ol>
        )}
      </Card>
      <p className="text-caption text-text-2 tabular">
        {t.frozenNote(memberCount)} {t.reviewBody}
      </p>
    </section>
  );
}
