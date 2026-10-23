"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon, SegmentedControl } from "@/components";
import { cn } from "@/lib/cn";
import styles from "../landing.module.css";
import { fakeHash, shortHex } from "./hex";

/*
 * A Semaphore V4 proof, acted out on an 8-member group (depth-3 LeanIMT). Values are stand-ins
 * (see ./hex), but the shape is real: the same identity and poll always give the same nullifier,
 * so a second answer is rejected; a new poll gives an unrelated one.
 */

const LEAVES = 8;
const DEPTH = 3;
const W = 640;
const LEAF_Y = 236;
const LEVEL_GAP = 68;

type Phase = "idle" | "climbing" | "proving" | "accepted" | "rejected";
type View = "device" | "chain";
type Scope = "12" | "13";
type Choice = "yes" | "no";

function nodeX(level: number, index: number) {
  const span = W / (LEAVES >> level);
  return span * index + span / 2;
}
function nodeY(level: number) {
  return LEAF_Y - level * LEVEL_GAP;
}

const commitments = Array.from({ length: LEAVES }, (_, i) => fakeHash(`commitment:${i}`));
const root = fakeHash(`root:${commitments.join("")}`);

export function ProofDemo() {
  const [you, setYou] = useState(5);
  const [scope, setScope] = useState<Scope>("12");
  const [choice, setChoice] = useState<Choice>("yes");
  const [view, setView] = useState<View>("device");
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(-1);
  const used = useRef(new Set<string>());
  const timers = useRef<number[]>([]);

  const secret = fakeHash(`secret:${you}`);
  const nullifier = fakeHash(`nullifier:${scope}:${secret}`);
  const signals = useMemo(
    () => ({
      root,
      nullifier,
      message: `00${fakeHash(`message:${choice}`).slice(2)}`,
      scope: `00${fakeHash(`scope:${scope}`).slice(2)}`,
      points: Array.from({ length: 8 }, (_, i) => fakeHash(`pi:${nullifier}:${choice}:${i}`)),
    }),
    [nullifier, choice, scope],
  );

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const busy = phase === "climbing" || phase === "proving";
  const shown = phase !== "idle";

  function prove() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("climbing");
    setStep(0);
    for (let s = 1; s <= DEPTH; s++) {
      timers.current.push(window.setTimeout(() => setStep(s), s * 380));
    }
    timers.current.push(window.setTimeout(() => setPhase("proving"), DEPTH * 380 + 300));
    timers.current.push(
      window.setTimeout(
        () => {
          if (used.current.has(nullifier)) {
            setPhase("rejected");
          } else {
            used.current.add(nullifier);
            setPhase("accepted");
          }
        },
        DEPTH * 380 + 1300,
      ),
    );
  }

  function newMember() {
    timers.current.forEach(clearTimeout);
    let next = you;
    while (next === you) next = Math.floor(Math.random() * LEAVES);
    setYou(next);
    setPhase("idle");
    setStep(-1);
  }

  // Path from your leaf to the root, and the sibling at each level (the Merkle proof).
  const path = Array.from({ length: DEPTH + 1 }, (_, l) => you >> l);
  const onPath = (level: number, index: number) =>
    view === "device" && step >= level && path[level] === index;
  const isSibling = (level: number, index: number) =>
    view === "device" && step >= 0 && level < DEPTH && ((you >> level) ^ 1) === index;
  const rootLit = view === "chain" ? shown : step >= DEPTH;

  const status: Record<Phase, string> = {
    idle: "Pick an answer, then prove you’re a member.",
    climbing: "Hashing your way up the tree with Poseidon…",
    proving: "Building the Groth16 proof in the browser…",
    accepted: "Accepted. Proof checked on-chain, nullifier stored.",
    rejected: "Rejected. That nullifier is already used: this member already answered this poll.",
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_1fr]">
      <div className="rounded-lg border border-border bg-surface p-4 shadow-raised sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            label="Whose view"
            value={view}
            onValueChange={setView}
            options={[
              { value: "device", label: "Your phone" },
              { value: "chain", label: "The chain" },
            ]}
            className="w-full sm:w-auto"
          />
          <span className="text-caption text-text-3">
            {view === "device" ? "Only you see the highlighted leaf." : "Everyone sees all 8. Nobody sees which."}
          </span>
        </div>

        <svg viewBox={`0 0 ${W} 280`} className="w-full" role="img" aria-label={treeLabel(view, you, step, phase)}>
          {Array.from({ length: DEPTH }, (_, level) =>
            Array.from({ length: LEAVES >> level }, (_, i) => {
              const parent = i >> 1;
              const on = onPath(level, i) && onPath(level + 1, parent);
              return (
                <line
                  key={`e${level}-${i}`}
                  className={styles.edge}
                  data-on={on}
                  x1={nodeX(level, i)}
                  y1={nodeY(level)}
                  x2={nodeX(level + 1, parent)}
                  y2={nodeY(level + 1)}
                />
              );
            }),
          )}
          {Array.from({ length: DEPTH + 1 }, (_, level) =>
            Array.from({ length: LEAVES >> level }, (_, i) => {
              const leaf = level === 0;
              const top = level === DEPTH;
              const r = leaf || top ? 17 : 11;
              const mine = leaf && view === "device" && i === you;
              const lit = top ? rootLit : onPath(level, i);
              return (
                <g key={`n${level}-${i}`}>
                  <circle
                    className={styles.node}
                    data-on={lit}
                    data-you={mine}
                    strokeDasharray={isSibling(level, i) ? "3 3" : undefined}
                    cx={nodeX(level, i)}
                    cy={nodeY(level)}
                    r={r}
                  />
                  {leaf && (
                    <text className={styles.nodeLabel} x={nodeX(0, i)} y={LEAF_Y + 36} textAnchor="middle">
                      {commitments[i]?.slice(0, 4)}…
                    </text>
                  )}
                  {mine && (
                    <text className={styles.nodeLabel} x={nodeX(0, i)} y={LEAF_Y + 4} textAnchor="middle" style={{ fill: "var(--primary-fg)" }}>
                      you
                    </text>
                  )}
                  {top && (
                    <text className={styles.nodeLabel} x={nodeX(level, i)} y={nodeY(level) + 4} textAnchor="middle">
                      root
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </svg>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SegmentedControl
            label="Your answer (the message)"
            value={choice}
            onValueChange={setChoice}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            disabled={busy}
          />
          <SegmentedControl
            label="Which poll (the scope)"
            value={scope}
            onValueChange={(v) => {
              setScope(v);
              setPhase("idle");
              setStep(-1);
            }}
            options={[
              { value: "12", label: "Poll #12" },
              { value: "13", label: "Poll #13" },
            ]}
            disabled={busy}
          />
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button
            onClick={prove}
            loading={busy}
            loadingLabel={phase === "climbing" ? "Climbing the tree…" : "Proving…"}
            icon="verified"
          >
            {phase === "accepted" || phase === "rejected" ? "Try to answer again" : "Prove I’m a member"}
          </Button>
          <Button variant="secondary" onClick={newMember} disabled={busy} icon="anonymous">
            Be someone else
          </Button>
        </div>

        <p
          role="status"
          aria-live="polite"
          className={cn(
            "mt-4 flex items-start gap-2 text-label",
            phase === "accepted" && "text-success",
            phase === "rejected" && "text-danger",
            (phase === "idle" || busy) && "text-text-2",
          )}
        >
          {phase === "accepted" && <Icon icon="success" size={20} />}
          {phase === "rejected" && <Icon icon="alert" size={20} />}
          <span>{status[phase]}</span>
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Panel
          title="Public signals"
          caption="Sent with the proof. Anyone can read these on Stellar."
        >
          <Signal name="merkleTreeRoot" value={signals.root} shown={shown} />
          <Signal name="nullifier" value={signals.nullifier} shown={shown} note="Poseidon(scope, secret)" />
          <Signal name="hash(message)" value={signals.message} shown={shown} note={`your answer: ${choice}`} />
          <Signal name="hash(scope)" value={signals.scope} shown={shown} note={`poll #${scope}`} />
          <div className="pt-2">
            <div className="text-caption text-text-3">π: 8 BN254 field elements</div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-mono text-text-2 tabular sm:grid-cols-4">
              {signals.points.map((p, i) => (
                <span key={i} className={cn(shown && phase !== "climbing" ? styles.sharp : styles.blurred)}>
                  {shortHex(p, 3, 3)}
                </span>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          title="Private inputs"
          caption={view === "device" ? "Stay on your phone. Never sent, never stored." : "Not in the transaction. The chain never sees them."}
        >
          <Signal name="secretScalar" value={secret} shown={view === "device"} />
          <Signal name="leaf index" value={null} text={String(you)} shown={view === "device"} />
          <Signal
            name="siblings"
            value={null}
            text={`${DEPTH} hashes (dashed in the tree)`}
            shown={view === "device"}
          />
        </Panel>
        <p className="text-caption text-text-3">
          Illustrative values: the hashes on this page are stand-ins, not real Poseidon output.
        </p>
      </div>
    </div>
  );
}

function treeLabel(view: View, you: number, step: number, phase: Phase) {
  if (view === "chain") return "Merkle tree of 8 member commitments. The chain sees only the root; no leaf is marked.";
  const where = step >= DEPTH ? "The path from your leaf to the root is highlighted." : "";
  return `Merkle tree of 8 member commitments. Your leaf is number ${you + 1}. ${where} Status: ${phase}.`;
}

function Panel({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-raised">
      <h3 className="text-heading">{title}</h3>
      <p className="mt-1 text-caption text-text-3">{caption}</p>
      <dl className="mt-3 flex flex-col gap-2">{children}</dl>
    </section>
  );
}

function Signal({
  name,
  value,
  text,
  shown,
  note,
}: {
  name: string;
  value: string | null;
  text?: string;
  shown: boolean;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="font-mono text-mono text-text-2">{name}</dt>
      <dd className="flex items-baseline gap-2">
        {note && shown && <span className="hidden text-caption text-text-3 sm:inline">{note}</span>}
        <span
          aria-hidden={!shown}
          className={cn("font-mono text-mono text-text-1 tabular", shown ? styles.sharp : styles.blurred)}
        >
          {value ? shortHex(value, 6, 4) : text}
        </span>
        {!shown && <span className="sr-only">hidden</span>}
      </dd>
    </div>
  );
}
