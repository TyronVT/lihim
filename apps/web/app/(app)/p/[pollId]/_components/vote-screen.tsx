"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  AnonymityBanner,
  AppBar,
  Button,
  FooterLinks,
  Notice,
  OptionGroup,
  PinnedFooter,
  RatingRow,
  Screen,
  ShellHeader,
  StatusPill,
  VoteStatus,
  useCurrentGroup,
  type AnswerPhase,
  type VoteStatusPhase,
} from "@/components";
import { hasAnswered } from "@/lib/answered";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";
import { repo, type Group, type Poll } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";
import { env } from "@/lib/env";
import { formatClosing } from "@/lib/format";
import { pollDisplayStatus } from "@/lib/poll";
import { castVote, prefetchVoteInputs } from "@/lib/vote";
import { PollLoadError, PollLoading, PollNotFound } from "./states";

/**
 * The L6 answer flow as one state machine (P4: tap selects, "Send answer" commits). The
 * selection lives beside it in `selected`, only in memory for this render session — it's never
 * persisted (lib/answered stores the poll id only).
 */
type Stage =
  | { kind: "idle" }
  | { kind: "proving" | "sending"; slow: boolean }
  | { kind: "recorded" }
  /** From the device memory on load, or the relay's 409. Selection cleared: nothing may hint at it. */
  | { kind: "already" }
  /** X2: not in the member set frozen at open. Retrying can't help, so there's no primary. */
  | { kind: "late" }
  /** Nothing recorded. The selection is kept and "Send answer" is the retry. */
  | { kind: "failed"; reason: FailureReason };

type FailureReason = "not_sent" | "invalid" | "prove_failed";

/** Inline "Send answer" under the options: only at ≥ lg inside a shell, where the PinnedFooter hides. */
const INLINE_PRIMARY = "hidden lg:[[data-shell]_&]:flex";

interface VoteData {
  poll: Poll;
  group: Group | null;
  answeredBefore: boolean;
}

async function loadVote(pollId: string): Promise<VoteData | null> {
  const poll = await repo.getPoll(pollId);
  if (!poll) return null;
  // Load the frozen member set with the page, not when the answer is tapped (lib/vote.ts).
  if (poll.status === "open") prefetchVoteInputs(poll);
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
  if (query.status === "loading") return <PollLoading width="form" />;
  if (query.status === "error") return <PollLoadError onRetry={query.reload} />;
  if (!query.data) return <PollNotFound />;
  // Keyed by poll so navigating between polls never carries a stage over.
  return <VoteBody key={query.data.poll.id} data={query.data} onReload={query.reload} />;
}

function VoteBody({ data, onReload }: { data: VoteData; onReload: () => void }) {
  const { poll, group } = data;
  const router = useRouter();
  const questionId = useId();
  const [stage, setStage] = useState<Stage>(data.answeredBefore ? { kind: "already" } : { kind: "idle" });
  const [selected, setSelected] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useCurrentGroup(poll.groupId);

  useEffect(() => () => abortRef.current?.abort(), []);

  const display = pollDisplayStatus(poll);
  const isOpen = display === "open" || display === "closing-soon";
  // Closed: L7 is the page (spec L6 "Closed → redirect"). Decided on load only, so a poll that
  // closes while someone is on the recorded state doesn't yank them away.
  const [closedOnLoad] = useState(display === "closed");
  const backHref = `/g/${encodeURIComponent(poll.groupId)}`;
  const resultsHref = `/p/${encodeURIComponent(poll.id)}/results`;

  useEffect(() => {
    if (closedOnLoad) router.replace(resultsHref);
  }, [closedOnLoad, router, resultsHref]);

  // The identity is derived from poll.groupId (off-chain uuid, D1); the proof binds to the
  // frozen root + chain poll id, so the chain group id isn't needed to answer.
  const canAnswer = isOpen && !!poll.chainPollId && !!poll.frozenRoot;
  const busy = stage.kind === "proving" || stage.kind === "sending";
  const picking = canAnswer && (stage.kind === "idle" || stage.kind === "failed");

  async function send() {
    if (!picking || selected === null) return;
    const choice = selected;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStage({ kind: "proving", slow: false });
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
          setStage({ kind: "recorded" });
          break;
        case "already_answered":
          setSelected(null);
          setStage({ kind: "already" });
          break;
        case "prove_failed":
          if (result.notMember) {
            setSelected(null);
            setStage({ kind: "late" });
          } else {
            setStage({ kind: "failed", reason: "prove_failed" });
          }
          break;
        case "invalid":
        case "not_sent":
          setStage({ kind: "failed", reason: result.status });
          break;
        case "cancelled":
          // Passkey prompt dismissed: back to picking, selection kept, nothing to report.
          setStage({ kind: "idle" });
          break;
      }
    } catch {
      // Only reached when aborted (screen left mid-answer): nothing to show.
    }
  }

  const pick = (choice: number) => {
    if (picking) setSelected(choice);
  };

  // Number keys pick, Enter sends — every width, never while typing (spec §3, §7).
  const choices = poll.kind === "rating" ? [1, 2, 3, 4, 5] : poll.options.map((o) => o.value);
  useAnswerKeys(picking, choices, pick, send);

  // Shaped like L7, where this is going.
  if (closedOnLoad) return <PollLoading title={copy.results.title} />;

  // Map the stage onto the presentational pieces.
  const value = stage.kind === "already" || stage.kind === "late" ? null : selected;
  const answerPhase: AnswerPhase = busy ? "proving" : stage.kind === "recorded" || stage.kind === "already" ? "done" : "idle";
  const statusPhase: VoteStatusPhase = busy || stage.kind === "recorded" ? stage.kind : "idle";
  const slow = busy && stage.slow;

  const answered = stage.kind === "recorded" || stage.kind === "already";
  const locked = !canAnswer || answered || stage.kind === "late";

  // THE primary: "Send answer" while picking/sending, "See results" once answered. None for
  // "joined late" or a poll that isn't open yet.
  let primary: ReactNode = null;
  if (answered) {
    primary = (
      <Button icon="results" asChild>
        <Link href={resultsHref}>{copy.vote.seeResults}</Link>
      </Button>
    );
  } else if (canAnswer && stage.kind !== "late") {
    primary = (
      <Button icon="send"
        onClick={() => void send()}
        disabled={selected === null}
        loading={busy}
        loadingLabel={copy.vote.sending}
      >
        {copy.vote.send}
      </Button>
    );
  }

  const status = (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill status={display} />
      {display !== "draft" && <span className="text-caption text-text-2">{formatClosing(poll.closesAt)}</span>}
    </div>
  );

  return (
    <>
      <AppBar title={group?.name} backHref={backHref} />
      <Screen
        width="form"
        withFooter={!!primary}
        header={
          <ShellHeader
            back={{ href: backHref, label: group?.name ?? copy.vote.backToGroup }}
            // The question is the whole page: display type, as in the compact column.
            title={poll.title}
            titleClassName="text-display"
            context={status}
          />
        }
      >
        {/* Compact/medium heading block; at ≥ lg in a shell the ShellHeader carries it. */}
        <header className="flex flex-col gap-3 lg:[[data-shell]_&]:hidden">
          {status}
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
          {stage.kind === "late" && (
            <Notice title={copy.vote.notMember}>
              <Link
                href={backHref}
                className="inline-flex min-h-12 items-center text-label text-text-1 underline underline-offset-4"
              >
                {copy.vote.backToGroup}
              </Link>
            </Notice>
          )}
          {(display === "draft" || (isOpen && !canAnswer)) && (
            <Notice icon="closing" title={copy.vote.notOpenYet}>
              {copy.vote.notOpenYetBody}
            </Notice>
          )}
          {picking && <p className="text-label text-text-2">{copy.vote.pickThenSend}</p>}

          {poll.kind === "rating" ? (
            <RatingRow value={value} onSelect={pick} phase={answerPhase} labelledBy={questionId} disabled={locked} />
          ) : (
            <OptionGroup
              options={poll.options}
              value={value}
              onSelect={pick}
              phase={answerPhase}
              labelledBy={questionId}
              disabled={locked}
            />
          )}

          <VoteStatus phase={statusPhase} slow={slow} />

          {stage.kind === "failed" && (
            <FailureNotice
              reason={stage.reason}
              onReload={() => {
                setStage({ kind: "idle" });
                onReload();
              }}
            />
          )}

          {/* Expanded: send sits under the options so the eye goes question → options → send. */}
          {primary && (
            <div className={cn(INLINE_PRIMARY, "flex-col items-start gap-3 [&>*]:w-auto")}>
              {primary}
              {picking && (
                <p className="text-caption text-text-3">{copy.vote.keyboardHint(choices.length)}</p>
              )}
            </div>
          )}
        </div>

        <FooterLinks />
      </Screen>

      {primary && <PinnedFooter>{primary}</PinnedFooter>}
    </>
  );
}

/**
 * Window-level answer keys: `1`–`n` select the nth choice, `Enter` sends. Ignored while focus is
 * in a text field, with modifiers, and on focused buttons/links (they handle their own Enter).
 */
function useAnswerKeys(enabled: boolean, choices: number[], onPick: (value: number) => void, onSend: () => void) {
  const latest = useRef({ choices, onPick, onSend });
  useEffect(() => {
    latest.current = { choices, onPick, onSend };
  });

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
      if (isTypingTarget(e.target)) return;
      const { choices, onPick, onSend } = latest.current;
      if (/^[1-8]$/.test(e.key)) {
        const value = choices[Number(e.key) - 1];
        if (value === undefined) return;
        e.preventDefault();
        onPick(value);
      } else if (e.key === "Enter") {
        if (e.target instanceof Element && e.target.closest("a, button, [role='button'], summary")) return;
        e.preventDefault();
        onSend();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

const NON_TEXT_INPUTS = new Set(["button", "checkbox", "radio", "range", "reset", "submit", "color", "file", "image"]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

/** Nothing was recorded. The selection stays; "Send answer" is the retry (no second button). */
function FailureNotice({ reason, onReload }: { reason: FailureReason; onReload: () => void }) {
  if (reason === "invalid") {
    // Usually a stale member list (the poll's frozen root) — refetching the poll is the fix.
    return (
      <Notice
        tone="danger"
        title={copy.vote.invalid}
        action={
          <Button icon="retry" variant="secondary" onClick={onReload}>
            {copy.common.retry}
          </Button>
        }
      />
    );
  }
  return (
    <Notice tone="warning" title={reason === "not_sent" ? copy.vote.notSent : copy.errors.generic}>
      {reason === "prove_failed" ? copy.vote.proveFailedBody : undefined}
    </Notice>
  );
}
