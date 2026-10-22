"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  AppBar,
  Card,
  Icon,
  ResultBar,
  Screen,
  Section,
  SmallGroupWarning,
  StatusPill,
  TurnoutMeter,
  VerifiedBadge,
} from "@/components";
import { copy } from "@/lib/copy";
import { repo, type Poll, type PollResult } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";
import { formatAverage, formatClosing, formatPercent, formatShortDate, formatTime } from "@/lib/format";
import { isSmallGroup, optionLabel, pollDisplayStatus } from "@/lib/poll";
import { PollLoadError, PollLoading, PollNotFound } from "../../_components/states";

/** TODO: replace polling with a Supabase Realtime subscription on poll_results. */
const LIVE_REFRESH_MS = 30_000;

async function loadResults(pollId: string): Promise<{ poll: Poll; result: PollResult } | null> {
  const poll = await repo.getPoll(pollId);
  if (!poll || poll.status === "draft") return null;
  return { poll, result: await repo.getResults(pollId) };
}

/** "6:00 PM" today, else "Oct 24, 6:00 PM" — reads right after "closes at". */
function closingTime(iso: string): string {
  const sameDay = formatShortDate(iso) === formatShortDate(Date.now());
  // Reads after "closes at": "6:00 PM" today, else "10:00 PM on Oct 24".
  return sameDay ? formatTime(iso) : `${formatTime(iso)} on ${formatShortDate(iso)}`;
}

export function ResultsScreen({ pollId }: { pollId: string }) {
  const query = useQuery(() => loadResults(pollId), [pollId]);
  const open = query.status === "success" && query.data?.poll.status === "open";
  const { reload } = query;

  useEffect(() => {
    if (!open) return;
    const t = setInterval(reload, LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [open, reload]);

  if (query.status === "loading") return <PollLoading title={copy.results.title} />;
  if (query.status === "error") return <PollLoadError onRetry={query.reload} />;
  if (!query.data) return <PollNotFound />;

  const { poll, result } = query.data;
  const display = pollDisplayStatus(poll);
  const small = isSmallGroup(result.frozenSize);

  return (
    <>
      <AppBar title={copy.results.title} backHref={`/g/${encodeURIComponent(poll.groupId)}`} />
      <Screen>
        {/* Turnout and tallies change while open; announce the refreshed headline politely. */}
        <header className="flex flex-col gap-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={display} />
            <span className="text-caption text-text-2">{formatClosing(poll.closesAt)}</span>
          </div>
          <p className="text-body text-text-2">{poll.title}</p>
          <Headline poll={poll} result={result} />
        </header>

        {!result.hidden && result.rows && result.votersCount > 0 && (
          <Section title={copy.results.tally}>
            <Card className="flex flex-col gap-5">
              {result.rows.map((row) => (
                <ResultBar
                  key={row.value}
                  label={poll.kind === "rating" ? copy.vote.ratingAria(row.value) : row.label}
                  count={row.count}
                  total={result.votersCount}
                  leading={result.leadingValues.includes(row.value)}
                />
              ))}
            </Card>
            <p className="text-caption text-text-3">{display === "closed" ? copy.results.final : copy.results.live}</p>
          </Section>
        )}

        <Section title={copy.results.turnoutLabel}>
          <TurnoutMeter answered={result.votersCount} total={result.frozenSize} />
          {result.hidden && <p className="text-caption text-text-3">{copy.results.hiddenNote}</p>}
        </Section>

        <div className="flex flex-col gap-4">
          <VerifiedBadge pollId={poll.id} />
          {small && (
            <div className="flex flex-col gap-1">
              <SmallGroupWarning />
              <p className="pl-7 text-caption text-text-2">{copy.results.smallGroupBody}</p>
            </div>
          )}
          <Link
            href="/privacy"
            className="self-start py-3 text-label text-text-2 underline-offset-4 hover:text-text-1 hover:underline"
          >
            {copy.common.privacyLink}
          </Link>
        </div>
      </Screen>
    </>
  );
}

/** Leading option (or average rating) in `display`; hidden polls say when they'll show. */
function Headline({ poll, result }: { poll: Poll; result: PollResult }) {
  if (result.hidden) {
    return (
      <div className="flex items-start gap-3">
        <Icon icon="anonymous" className="mt-1 shrink-0 text-text-2" />
        <h2 className="text-title text-text-1">{copy.results.hiddenUntil(closingTime(poll.closesAt))}</h2>
      </div>
    );
  }

  if (result.votersCount === 0 || !result.rows) {
    return <h2 className="text-title text-text-1">{copy.results.noAnswers}</h2>;
  }

  if (poll.kind === "rating" && result.average !== null) {
    return <h2 className="text-display text-text-1 tabular">{copy.results.average(formatAverage(result.average))}</h2>;
  }

  const leading = result.leadingValues;
  if (leading.length > 1) {
    return (
      <div className="flex flex-col gap-1">
        <h2 className="text-display text-text-1">{copy.results.tie}</h2>
        <p className="text-label text-text-2">
          {copy.results.tiedOptions(leading.map((v) => optionLabel(poll.options, v)))}
        </p>
      </div>
    );
  }

  const top = result.rows.find((r) => r.value === leading[0]);
  if (!top) return <h2 className="text-title text-text-1">{copy.results.noAnswers}</h2>;
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-display text-text-1">{copy.results.leading(top.label)}</h2>
      <p className="text-label text-text-2 tabular">
        {copy.results.leadingDetail(top.count, result.votersCount, formatPercent(top.count, result.votersCount))}
      </p>
    </div>
  );
}
