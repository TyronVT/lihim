import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { Button, Icon, Illustration, Lockup, type IconName } from "@/components";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";
import { fakeHash, shortHex } from "./_components/hex";
import { Hero } from "./_components/hero";
import { ProofDemo } from "./_components/proof-demo";
import { LitCard, Reveal } from "./_components/reveal";
import styles from "./landing.module.css";
import { APP_HOME, LANDING } from "@/lib/routes";

export const metadata: Metadata = {
  title: { absolute: `${copy.brand.name} — ${copy.brand.tagline}` },
  description:
    "Anonymous polls for small groups, verified on Stellar with Semaphore V4 zero-knowledge proofs. Only members answer, once each, and nobody can tell who said what.",
};

const WRAP = "mx-auto w-full max-w-[1120px] px-4 sm:px-8";

// Server-rendered and deterministic, so the client hydrates the same text.
const FIELD = Array.from({ length: 90 }, (_, i) => `0x${fakeHash(`field:${i}`)}`).join(" ");
const EVENTS = Array.from({ length: 10 }, (_, i) => ({
  poll: 12 + (i % 3),
  nullifier: shortHex(fakeHash(`ticker-n:${i}`)),
  root: shortHex(fakeHash(`ticker-r:${i % 3}`)),
  ledger: 58_210_400 + i * 7,
}));

export default function WelcomePage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-surface-raised focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <TopBar />
      <main id="main">
        <Hero field={FIELD}>
          <div className={cn(WRAP, "flex flex-col items-center pt-16 pb-20 text-center sm:pt-24 sm:pb-28")}>
            <div className="animate-fade-in">
              <Illustration name="mark" size={128} priority alt="" />
            </div>
            <p className="mt-8 text-overline text-text-2 uppercase">Anonymous polls · verified on Stellar</p>
            <h1 id="hero-title" className={cn(styles.display, "mt-4 max-w-[14ch]")}>
              <Words text="Say what you" start={0} />{" "}
              <span className={styles.veil}>really</span> <Words text="think." start={4} />
            </h1>
            <p className={cn(styles.lede, "mt-6 max-w-[56ch] text-text-2")}>
              Only members can answer. Each person answers once. Not even the admin can tell who said what, and
              anyone can recount the result.
            </p>
            <p className="mt-3 text-caption text-text-3 italic" lang="tl">
              {copy.brand.taglineTl}
            </p>
            <div className="mt-10 flex w-full max-w-[420px] flex-col gap-3 sm:flex-row">
              <Button asChild icon="arrowRight">
                <Link href={APP_HOME}>Open Lihim</Link>
              </Button>
              <Button asChild variant="secondary" icon="verified">
                <a href="#zk">See the proof</a>
              </Button>
            </div>
            <dl className="mt-14 grid w-full max-w-[760px] grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
              <Fact value="≈ 1 s" label="to prove, in your browser" />
              <Fact value="0" label="names or emails on-chain" />
              <Fact value="1" label="answer per member per poll" />
              <Fact value="8+" label="members before a poll opens" />
            </dl>
          </div>
        </Hero>

        <Ticker />

        <Section id="problem" overline="The problem" title="Every group poll today breaks one way or another.">
          <Reveal className="mt-10 overflow-x-auto rounded-lg border border-border bg-surface shadow-raised">
            <table className="w-full min-w-[620px] text-left text-label">
              <caption className="sr-only">How Lihim compares with anonymous and login-required forms</caption>
              <thead>
                <tr className="border-b border-border text-text-2">
                  <th scope="col" className="px-4 py-4 font-medium">
                    What you need
                  </th>
                  <th scope="col" className="px-4 py-4 font-medium">
                    Anonymous form
                  </th>
                  <th scope="col" className="px-4 py-4 font-medium">
                    Login form
                  </th>
                  <th scope="col" className="px-4 py-4 font-semibold text-text-1">
                    Lihim
                  </th>
                </tr>
              </thead>
              <tbody>
                <Row need="Only members can answer" cells={[false, true, true]} />
                <Row need="One answer per person" cells={[false, true, true]} />
                <Row need="Nobody sees who said what" cells={[true, false, true]} />
                <Row need="Anyone can recount the result" cells={[false, false, true]} />
                <Row need="Outsiders can’t flood it" cells={[false, true, true]} last />
              </tbody>
            </table>
          </Reveal>
        </Section>

        <Section id="how" overline="How it works" title="Five steps. You only notice one tap.">
          <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 80} className="flex">
                <LitCard className="flex w-full flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-raised">
                  <div className="flex items-center justify-between">
                    <Icon icon={s.icon} size={24} className="text-text-1" />
                    <span className="font-mono text-mono text-text-3 tabular">0{i + 1}</span>
                  </div>
                  <h3 className="text-heading">{s.title}</h3>
                  <p className="text-label font-normal text-text-2">{s.body}</p>
                </LitCard>
              </Reveal>
            ))}
          </ol>
        </Section>

        <Section
          id="zk"
          overline="The zero-knowledge part"
          title="Semaphore V4, running on Soroban."
          intro="Lihim uses Semaphore V4, PSE’s anonymous-signalling protocol: a Groth16 proof over the BN254 curve that says “I know the secret behind one of the commitments in this group’s Merkle tree, and here is my one-time nullifier for this poll.” It never says which commitment. Try it."
        >
          <Reveal className="mt-10">
            <ProofDemo />
          </Reveal>

          <h3 className="mt-20 text-title">The algorithm, step by step</h3>
          <p className="mt-2 max-w-[64ch] text-text-2">
            Same circuits, verification keys and JS libraries as upstream Semaphore V4. What Lihim adds is the Stellar
            side: Poseidon and the LeanIMT in a Soroban contract, a Groth16 verifier on Stellar’s native BN254 host
            functions, and nullifier storage.
          </p>
          <ol className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2">
            {ALGORITHM.map((a, i) => (
              <Reveal as="li" key={a.title} delay={(i % 2) * 80} className="flex min-w-0">
                <LitCard className="flex w-full min-w-0 flex-col rounded-lg border border-border bg-surface p-5 shadow-raised">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-mono text-text-3 tabular">0{i + 1}</span>
                    <h4 className="text-heading">{a.title}</h4>
                  </div>
                  <pre className="mt-4 overflow-x-auto rounded-sm border border-border bg-bg px-3 py-3 font-mono text-mono text-text-1">
                    {a.math}
                  </pre>
                  <p className="mt-4 text-label font-normal text-text-2">{a.body}</p>
                </LitCard>
              </Reveal>
            ))}
          </ol>

          <div className="mt-12 grid gap-3 md:grid-cols-2">
            <Reveal>
              <Honest
                tone="yes"
                title="What the proof guarantees"
                items={[
                  "The answer came from someone in the group’s member tree.",
                  "Each member answers each poll once (one nullifier per poll).",
                  "Your answers in different polls and groups can’t be linked to each other.",
                  "Every counted answer passed the same on-chain check, so anyone can recount.",
                ]}
              />
            </Reveal>
            <Reveal delay={80}>
              <Honest
                tone="no"
                title="What it doesn’t do"
                items={[
                  "Decide who counts as a member. That’s the group admin’s job.",
                  "Hide that you joined. The admin sees the member list, just never the answers.",
                  "Make a group of 3 anonymous. That’s why polls need 8+ members to open.",
                  "Hide a running tally from the chain. Live results are hidden in the app only.",
                ]}
              />
            </Reveal>
          </div>
        </Section>

        <Section id="stack" overline="Built with" title="The technology underneath.">
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STACK.map((g, i) => (
              <Reveal key={g.title} delay={(i % 3) * 80} className="flex">
                <LitCard className="flex w-full flex-col rounded-lg border border-border bg-surface p-5 shadow-raised">
                  <div className="flex items-center gap-3">
                    <Icon icon={g.icon} size={20} className="text-text-2" />
                    <h3 className="text-heading">{g.title}</h3>
                  </div>
                  <p className="mt-2 text-caption text-text-3">{g.blurb}</p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {g.items.map((t) => (
                      <li
                        key={t}
                        className="rounded-full border border-border bg-bg px-3 py-1 font-mono text-mono text-text-1"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                </LitCard>
              </Reveal>
            ))}
          </div>
        </Section>

        <Section id="rules" overline="House rules" title="Things Lihim will never do.">
          <ul className="mt-10 grid gap-3 md:grid-cols-3">
            {RULES.map((r, i) => (
              <Reveal as="li" key={r.title} delay={i * 80}>
                <div className="h-full border-t border-border-control pt-5">
                  <h3 className="text-heading">{r.title}</h3>
                  <p className="mt-2 text-label font-normal text-text-2">{r.body}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </Section>

        <section className="border-t border-border">
          <Reveal className={cn(WRAP, "flex flex-col items-center py-24 text-center")}>
            <Illustration name="verified" size={96} />
            <h2 className={cn(styles.h2, "mt-8 max-w-[20ch]")}>Your group already knows the answer. Let them say it.</h2>
            <p className={cn(styles.lede, "mt-4 max-w-[48ch] text-text-2")}>
              Start a group, share one invite link, and ask the question nobody asks out loud.
            </p>
            <div className="mt-10 flex w-full max-w-[420px] flex-col gap-3 sm:flex-row">
              <Button asChild icon="createGroup">
                <Link href="/groups/new">Create a group</Link>
              </Button>
              <Button asChild variant="secondary" icon="anonymous">
                <Link href="/privacy">Who can see what</Link>
              </Button>
            </div>
          </Reveal>
        </section>
      </main>
      <Footer />
    </>
  );
}

/* ——— Pieces ——— */

function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg">
      <div className={cn(WRAP, "flex h-16 items-center justify-between gap-4")}>
        <Link href={LANDING} aria-label="Lihim home" className="rounded-sm">
          <Lockup markSize={32} />
        </Link>
        <nav aria-label="Page sections" className="hidden items-center gap-8 text-label text-text-2 md:flex">
          <a href="#how" className="hover:text-text-1">
            How it works
          </a>
          <a href="#zk" className="hover:text-text-1">
            The proof
          </a>
          <a href="#stack" className="hover:text-text-1">
            Stack
          </a>
          <Link href="/privacy" className="hover:text-text-1">
            Who can see what
          </Link>
        </nav>
        <Button asChild block={false} className="min-h-10 px-4">
          <Link href={APP_HOME}>Open app</Link>
        </Button>
      </div>
    </header>
  );
}

function Words({ text, start }: { text: string; start: number }) {
  // Spaces sit between the inline-block spans: inside one, a leading space collapses.
  return text.split(" ").map((w, i) => (
    <Fragment key={i}>
      {i > 0 && " "}
      <span className={styles.unblur} style={{ "--i": start + i } as CSSProperties}>
        {w}
      </span>
    </Fragment>
  ));
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 bg-bg px-3 py-5">
      <dt className="sr-only">{label}</dt>
      <dd className="text-title tabular">{value}</dd>
      <dd className="text-caption text-text-3" aria-hidden="true">
        {label}
      </dd>
    </div>
  );
}

function Ticker() {
  const row = EVENTS.map((e, i) => (
    <span key={i} className="flex shrink-0 items-center gap-3 px-6 font-mono text-mono text-text-3">
      <Icon icon="success" size={14} className="text-success" />
      <span className="text-text-2">ProofValidated</span>
      <span>poll #{e.poll}</span>
      <span>nullifier {e.nullifier}</span>
      <span>root {e.root}</span>
      <span className="tabular">ledger {e.ledger.toLocaleString("en-US")}</span>
    </span>
  ));
  return (
    <div
      className={cn(styles.ticker, "overflow-hidden border-y border-border bg-surface py-3")}
      aria-label="Example of what anyone can read on-chain: verified answers, no names"
      role="img"
    >
      <div className={styles.tickerTrack} aria-hidden="true">
        {row}
        {row}
      </div>
    </div>
  );
}

function Section({
  id,
  overline,
  title,
  intro,
  children,
}: {
  id: string;
  overline: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16 border-t border-border py-20 sm:py-28">
      <div className={WRAP}>
        <Reveal>
          <p className="text-overline text-text-3 uppercase">{overline}</p>
          <h2 id={`${id}-title`} className={cn(styles.h2, "mt-3 max-w-[22ch]")}>
            {title}
          </h2>
          {intro && <p className={cn(styles.lede, "mt-5 max-w-[68ch] text-text-2")}>{intro}</p>}
        </Reveal>
        {children}
      </div>
    </section>
  );
}

function Row({ need, cells, last }: { need: string; cells: [boolean, boolean, boolean]; last?: boolean }) {
  return (
    <tr className={cn(!last && "border-b border-border")}>
      <th scope="row" className="px-4 py-4 font-normal text-text-1">
        {need}
      </th>
      {cells.map((ok, i) => (
        <td key={i} className={cn("px-4 py-4", i === 2 && "bg-surface-raised")}>
          <span className={cn("inline-flex items-center gap-2", ok ? "text-text-1" : "text-text-3")}>
            <Icon icon={ok ? "check" : "close"} size={18} className={ok ? (i === 2 ? "text-success" : "") : ""} />
            {ok ? "Yes" : "No"}
          </span>
        </td>
      ))}
    </tr>
  );
}

function Honest({ tone, title, items }: { tone: "yes" | "no"; title: string; items: string[] }) {
  return (
    <div className="h-full rounded-lg border border-border bg-surface p-5 shadow-raised">
      <h4 className="text-heading">{title}</h4>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((t) => (
          <li key={t} className="flex gap-3 text-label font-normal text-text-2">
            <Icon
              icon={tone === "yes" ? "check" : "minus"}
              size={18}
              className={cn("mt-px shrink-0", tone === "yes" ? "text-success" : "text-text-3")}
            />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className={cn(WRAP, "flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between")}>
        <Lockup markSize={28} tagline={copy.brand.tagline} />
        <p className="max-w-[44ch] text-caption text-text-3">
          In development: contracts run in local tests and are not yet on Stellar testnet. Lihim never moves money and
          puts no names on-chain.
        </p>
      </div>
    </footer>
  );
}

/* ——— Content ——— */

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "passkey",
    title: "Join with a passkey",
    body: "Open the invite, use Face ID or your fingerprint. No password, no wallet, no seed phrase.",
  },
  {
    icon: "members",
    title: "Get a secret per group",
    body: "Your phone derives a fresh identity for this group and adds only its public commitment to the tree.",
  },
  {
    icon: "verified",
    title: "Prove, don’t tell",
    body: "When you answer, your browser builds a zero-knowledge proof that you’re a member. About a second.",
  },
  {
    icon: "send",
    title: "A relay sends it",
    body: "A relay with no cookies and no IP logs submits it, so no Stellar account is tied to you.",
  },
  {
    icon: "results",
    title: "Anyone can recount",
    body: "Stellar checks the proof and stores the nullifier. The public verify page recounts from chain data.",
  },
];

const ALGORITHM: { title: string; math: string; body: string }[] = [
  {
    title: "Identity, one per group",
    math: `prf  = WebAuthn-PRF(passkey, sha256("lihim/v1"))
sk   = HKDF-SHA256(prf, "lihim/sem/" ‖ group)
(pk, secretScalar) = EdDSA-Poseidon(sk)  // Baby Jubjub`,
    body: "Derived on your phone from your passkey, so a lost phone recovers the same identities. A different group gives a different key, so your groups can’t be linked on-chain.",
  },
  {
    title: "Commitment",
    math: `C = Poseidon(pk.x, pk.y)`,
    body: "The public “padlock” that goes on-chain. It says someone joined, not who.",
  },
  {
    title: "Group tree",
    math: `root = LeanIMT_Poseidon(C₀, C₁, …, Cₙ₋₁)
depth ∈ 1..32,  insert ≈ depth hashes`,
    body: "A Lean Incremental Merkle Tree kept by the Soroban contract with on-chain Poseidon. When a poll opens, its root is frozen.",
  },
  {
    title: "Nullifier",
    math: `N = Poseidon(scope, secretScalar)
scope = poll id,  message = your answer`,
    body: "Same member and same poll always give the same N, so a second answer is rejected. A new poll gives an unrelated N.",
  },
  {
    title: "Groth16 proof over BN254",
    math: `public  = [root, N, h(message), h(scope)]
private = [secretScalar, leaf index, siblings]
h(x)    = keccak256(x) >> 8
π       = 8 field elements`,
    body: "Built in a Web Worker with the official Semaphore V4 circuits and the keys from PSE’s multi-party trusted setup ceremony. One verification key per tree depth.",
  },
  {
    title: "On-chain check",
    math: `L = IC₀ + Σ sᵢ·ICᵢ            // bn254 g1_msm
e(−A, B)·e(α, β)·e(L, γ)·e(C, δ) = 1  // pairing_check
root ∈ recent roots,  N ∉ used  →  store N`,
    body: "LihimVerifier runs the pairing check on Stellar’s native BN254 host functions and rejects off-curve or out-of-range inputs. LihimSemaphore then stores N and emits ProofValidated.",
  },
];

const STACK: { icon: IconName; title: string; blurb: string; items: string[] }[] = [
  {
    icon: "verified",
    title: "Zero-knowledge",
    blurb: "Semaphore V4, compatible byte-for-byte with the official libraries.",
    items: ["Semaphore V4", "Groth16", "BN254", "Poseidon", "LeanIMT", "Baby Jubjub", "EdDSA-Poseidon", "keccak256", "Circom"],
  },
  {
    icon: "poll",
    title: "Stellar contracts",
    blurb: "Three Soroban contracts in Rust: verifier, Semaphore groups and polls.",
    items: ["Stellar", "Soroban", "Rust", "soroban-sdk 28", "soroban-poseidon", "BN254 host functions"],
  },
  {
    icon: "passkey",
    title: "Keys and identity",
    blurb: "One passkey signs you in and derives every group identity. Nothing to write down.",
    items: ["WebAuthn passkeys", "PRF extension", "HKDF-SHA256", "Ed25519 admin keys", "@noble/curves"],
  },
  {
    icon: "anonymous",
    title: "Client and SDK",
    blurb: "A PWA with the prover in a Web Worker, and an SDK other Stellar apps can use.",
    items: [
      "Next.js 16",
      "React 19",
      "TypeScript",
      "Tailwind CSS 4",
      "Radix UI",
      "@lihim/sdk",
      "@semaphore-protocol/proof",
      "@stellar/stellar-sdk",
    ],
  },
  {
    icon: "send",
    title: "Vote relay",
    blurb: "Pays fees and submits proofs. No cookies, no auth header, no IP logs.",
    items: ["Hono", "Node.js", "simulate-then-submit"],
  },
  {
    icon: "groups",
    title: "Off-chain data",
    blurb: "Names and invites live here, behind row-level security. Votes never do.",
    items: ["Supabase", "Postgres + RLS", "Edge Functions (Deno)", "pg_cron indexer"],
  },
];

const RULES = [
  {
    title: "Move money",
    body: "No payments, prizes, betting or paid votes. Ever.",
  },
  {
    title: "Put your name on-chain",
    body: "On-chain: roots, commitments, nullifiers, poll ids and answers. Names and emails stay off-chain, visible only to your group admin.",
  },
  {
    title: "Promise “100% anonymous”",
    body: "We say exactly who can see what. In a small group, a lone answer can still be guessed, so polls need 8+ members.",
  },
];
