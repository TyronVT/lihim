"use client";

import { CircleCheck } from "lucide-react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";
import { Illustration } from "./illustration";

export type VoteStatusPhase = "idle" | "proving" | "sending" | "recorded";

export interface VoteStatusProps {
  phase: VoteStatusPhase;
  /** Proving passed 4 s (castVote's onSlow): adds the reassurance line. */
  slow?: boolean;
  className?: string;
}

/**
 * The words half of L6's proving moment, in an aria-live="polite" region.
 * proving/sending → "Pinapatunayang member ka…" over "Proving you're a member…" (+ slow line) · recorded → Poll illustration
 * rises in (320 ms, 8 px) with a success check and "Recorded anonymously".
 * Never a spinner without words.
 */
export function VoteStatus({ phase, slow, className }: VoteStatusProps) {
  return (
    <div aria-live="polite" aria-atomic="true" className={cn("min-h-6", className)}>
      {(phase === "proving" || phase === "sending") && (
        <div className="flex flex-col gap-1 animate-fade-in">
          {/* Design: "Pinapatunayang member ka…" / "Proving you're a member…" — Taglish first, English under it. */}
          <p lang="fil" className="text-label text-text-1">
            {copy.vote.provingTl}
          </p>
          <p className="text-caption text-text-2">{copy.vote.proving}</p>
          {slow && <p className="text-caption text-text-3">{copy.vote.slow}</p>}
        </div>
      )}
      {phase === "recorded" && (
        <div className="flex flex-col items-center gap-4 py-4 text-center animate-rise-in">
          <Illustration name="poll" size={96} priority />
          <p className="flex items-center gap-2 text-heading text-text-1">
            <Icon icon={CircleCheck} className="text-success" />
            {copy.vote.recorded}
          </p>
        </div>
      )}
    </div>
  );
}
