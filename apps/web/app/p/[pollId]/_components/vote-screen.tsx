"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  AnonymityBanner,
  AppBar,
  Button,
  Notice,
  OptionGroup,
  PinnedFooter,
  RatingRow,
  Screen,
  StatusPill,
  VoteStatus,
  type AnswerPhase,
  type VoteStatusPhase,
} from "@/components";
import { hasAnswered } from "@/lib/answered";
import { copy } from "@/lib/copy";
import { repo, type Group, type Poll } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";
import { env } from "@/lib/env";
import { formatClosing } from "@/lib/format";
import { pollDisplayStatus } from "@/lib/poll";
import { castVote } from "@/lib/vote";
import { PollLoadError, PollLoading, PollNotFound } from "./states";

/**
 * The L6 answer flow as one state machine. `choice` is kept only in memory for this
 * render session — it's never persisted (lib/answered stores the poll id only).
 */
type Stage =
  | { kind: "idle" }
  | { kind: "proving" | "sending"; choice: number; slow: boolean }
  | { kind: "recorded"; choice: number }
  /** From the device memory on load, or the relay's 409. No choice: nothing may hint at it. */
  | { kind: "already" }
  | { kind: "failed"; choice: number; reason: FailureReason };

type FailureReason = "not_sent" | "invalid" | "prove_failed" | "not_member";

interface VoteData {
  poll: Poll;
  group: Group | null;
  answeredBefore: boolean;
}

async function loadVote(pollId: string): Promise<VoteData | null> {
  const poll = await repo.getPoll(pollId);
  if (!poll) return null;
  const group = await repo.getGroup(poll.groupId);
  // Read device memory inside the query (client-only, after hydration) rather than in render.
  return { poll, group, answeredBefore: hasAnswered(poll.id) };
}

/** Dev/QA only: `?prove_ms=6000` stretches the mock prover to exercise the slow line. */
function devSimulateMs(): number | undefined {
  if (!env.devRoutes || env.relayUrl) return undefined;
  const v = Number(new URLSearchParams(window.location.search).get("prove_ms"));
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

export function VoteScreen({ pollId }: { pollId: string }) {
  const query = useQuery(() => loadVote(pollId), [pollId]);
  if (query.status === "loading") return <PollLoading />;
  if (query.status === "error") return <PollLoadError onRetry={query.reload} />;
  if (!query.data) return <PollNotFound />;
  // Keyed by poll so navigating between polls never carries a stage over.
  return <VoteBody key={query.data.poll.id} data={query.data} onReload={query.reload} />;
}

function VoteBody({ data, onReload }: { data: VoteData; onReload: () => void }) {
  const { poll, group } = data;
  const questionId = useId();
  const [stage, setStage] = useState<Stage>(data.answeredBefore ? { kind: "already" } : { kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const display = pollDisplayStatus(poll);
  const isOpen = display === "open" || display === "closing-soon";
  // The identity is derived from poll.groupId (off-chain uuid, D1); the proof binds to the
  // frozen root + chain poll id, so the chain group id isn't needed to answer.
  const canAnswer = isOpen && !!poll.chainPollId && !!poll.frozenRoot;

  async function answer(choice: number) {
    if (!canAnswer) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStage({ kind: "proving", choice, slow: false });
    try {
      const result = await castVote(poll, choice, {
        signal: ac.signal,
        simulateMs: devSimulateMs(),
        onPhase: (phase) => setStage((s) => (s.kind === "proving" || s.kind === "sending" ? { ...s, kind: phase } : s)),
        onSlow: () => setStage((s) => (s.kind === "proving" || s.kind === "sending" ? { ...s, slow: true } : s)),
      });
      if (ac.signal.aborted) return;
      switch (result.status) {
        case "recorded":
          setStage({ kind: "recorded", choice });
          break;
        case "already_answered":
          setStage({ kind: "already" });
          break;
        case "prove_failed":
          setStage({ kind: "failed", choice, reason: result.notMember ? "not_member" : "prove_failed" });
          break;
        case "invalid":
        case "not_sent":
          setStage({ kind: "failed", choice, reason: result.status });
          break;
      }
    } catch {
      // Only reached when aborted (screen left mid-answer): nothing to show.
    }
  }

  // Tap = answer, no submit step. TODO(design open question): a ConfirmSheet before
  // answering "important" Yes/No polls, since a mis-tap can't be undone.
  const onSelect = (choice: number) => {
    if (stage.kind === "idle" || stage.kind === "failed") void answer(choice);
  };

  // Map the stage onto the two presentational pieces.
  const value = stage.kind === "idle" || stage.kind === "already" ? null : stage.choice;
  const answerPhase: AnswerPhase =
    stage.kind === "proving" || stage.kind === "sending"
      ? "proving"
      : stage.kind === "recorded" || stage.kind === "already"
        ? "done"
        : "idle";
  const statusPhase: VoteStatusPhase =
    stage.kind === "proving" || stage.kind === "sending" || stage.kind === "recorded" ? stage.kind : "idle";
  const slow = (stage.kind === "proving" || stage.kind === "sending") && stage.slow;

  const answered = stage.kind === "recorded" || stage.kind === "already";
  const showFooter = answered || display === "closed";
  const backHref = `/g/${encodeURIComponent(poll.groupId)}`;
  const resultsHref = `/p/${encodeURIComponent(poll.id)}/results`;

  return (
    <>
      <AppBar title={group?.name} backHref={backHref} />
      <Screen withFooter={showFooter}>
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={display} />
            {display !== "draft" && (
              <span className="text-caption text-text-2">{formatClosing(poll.closesAt)}</span>
            )}
          </div>
          <h2 id={questionId} className="text-display text-text-1">
            {poll.title}
          </h2>
        </header>

        <div className="flex flex-col gap-4">
          <AnonymityBanner>{copy.anonymity.bannerVote}</AnonymityBanner>

          {stage.kind === "already" && (
            <Notice tone="danger" title={copy.vote.alreadyAnswered}>
              {copy.vote.alreadyAnsweredBody}
            </Notice>
          )}
          {display === "closed" && stage.kind !== "already" && (
            <Notice title={copy.vote.pollClosed}>{copy.vote.closedBody}</Notice>
          )}
          {(display === "draft" || (isOpen && !canAnswer)) && (
            <Notice icon="closing" title={copy.vote.notOpenYet}>
              {copy.vote.notOpenYetBody}
            </Notice>
          )}
          {canAnswer && stage.kind === "idle" && (
            <p className="text-label text-text-2">{copy.vote.tapToAnswer}</p>
          )}

          {poll.kind === "rating" ? (
            <RatingRow
              value={value}
              onSelect={onSelect}
              phase={answerPhase}
              labelledBy={questionId}
              disabled={!canAnswer || answered}
            />
          ) : (
            <OptionGroup
              options={poll.options}
              value={value}
              onSelect={onSelect}
              phase={answerPhase}
              labelledBy={questionId}
              disabled={!canAnswer || answered}
            />
          )}

          <VoteStatus phase={statusPhase} slow={slow} />

          {stage.kind === "failed" && (
            <FailureNotice
              reason={stage.reason}
              onRetry={() => answer(stage.choice)}
              onReload={() => {
                setStage({ kind: "idle" });
                onReload();
              }}
            />
          )}
        </div>

        <Link
          href="/privacy"
          className="self-start py-3 text-label text-text-2 underline-offset-4 hover:text-text-1 hover:underline"
        >
          {copy.common.privacyLink}
        </Link>
      </Screen>

      {showFooter && (
        <PinnedFooter>
          <Button asChild>
            <Link href={resultsHref}>{copy.vote.seeResults}</Link>
          </Button>
        </PinnedFooter>
      )}
    </>
  );
}

function FailureNotice({
  reason,
  onRetry,
  onReload,
}: {
  reason: FailureReason;
  onRetry: () => void;
  onReload: () => void;
}) {
  if (reason === "not_member") {
    // Not in the member set frozen at open: retrying can't help.
    return <Notice tone="danger" title={copy.vote.notMember} />;
  }
  if (reason === "invalid") {
    // Usually a stale member list (the poll's frozen root) — refetching the poll is the fix.
    return (
      <Notice
        tone="danger"
        title={copy.vote.invalid}
        action={
          <Button variant="secondary" onClick={onReload}>
            {copy.common.retry}
          </Button>
        }
      />
    );
  }
  // TODO(M0): stay quiet on a cancelled passkey prompt once passkeys exist.
  return (
    <Notice
      tone="warning"
      title={reason === "not_sent" ? copy.vote.notSent : copy.errors.generic}
      action={
        <Button variant="secondary" onClick={onRetry}>
          {copy.common.retry}
        </Button>
      }
    >
      {reason === "prove_failed" ? copy.vote.proveFailedBody : undefined}
    </Notice>
  );
}
