"use client";

import { UserMinus } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import {
  AnonymityBanner,
  AppBar,
  AppBarAction,
  Button,
  Card,
  ConfirmSheet,
  CountBadge,
  DataTable,
  EmptyState,
  FocusedTopBar,
  FooterLinks,
  HashChip,
  Icon,
  Icons,
  Illustration,
  ListRow,
  Lockup,
  MemberCountBlock,
  Notice,
  OptionGroup,
  OptionRow,
  OverflowMenu,
  PageHeader,
  REVEAL_ON_ROW_HOVER,
  RatingRow,
  ResultBar,
  Screen,
  Section,
  SegmentedControl,
  Sheet,
  ShellHeader,
  SkeletonList,
  SmallGroupWarning,
  StatusPill,
  StatusRow,
  Stepper,
  Switch,
  TextArea,
  TextField,
  ThemeSelect,
  TurnoutMeter,
  VerifiedBadge,
  VoteStatus,
  Wordmark,
  notify,
  type AnswerPhase,
  type DataTableColumn,
  type IconName,
  type VoteStatusPhase,
} from "@/components";
import { copy } from "@/lib/copy";
import { MOCK_GROUP_IDS, RATING_OPTIONS, YES_NO_OPTIONS } from "@/lib/data/mock";
import type { PollOption } from "@/lib/data/types";
import { formatClosing, formatShortDate } from "@/lib/format";
import { castVote } from "@/lib/vote";

const SAMPLE_OPTIONS: PollOption[] = ["Tagaytay", "Baguio", "La Union", "Sa campus na lang"].map((label, value) => ({ value, label }));
const SAMPLE_HASH = "0x1a7f3a9c210b44e8d5c6f0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3c91e";
// Fixed instant: render must be pure and server/client output must match.
const NOW = Date.parse("2026-10-22T02:00:00Z");
const DEMO_POLL = { id: "dev_poll", groupId: "dev_group", chainPollId: "999", frozenRoot: SAMPLE_HASH };

interface DemoMember {
  id: string;
  name: string;
  joined: number;
  admin?: boolean;
}

const DEMO_MEMBERS: DemoMember[] = [
  { id: "m1", name: "Ana Reyes", joined: NOW - 120 * 86_400_000, admin: true },
  { id: "m2", name: "Ella Dela Cruz", joined: NOW - 119 * 86_400_000 },
  { id: "m3", name: "Paolo Santos", joined: NOW - 40 * 86_400_000 },
  { id: "m4", name: "Bea Garcia", joined: NOW - 3 * 86_400_000 },
];

const MEMBER_COLUMNS: DataTableColumn<DemoMember>[] = [
  { key: "name", header: copy.roster.colName, cell: (m) => m.name, sortValue: (m) => m.name, width: "45%" },
  { key: "joined", header: copy.roster.colJoined, cell: (m) => formatShortDate(m.joined), sortValue: (m) => m.joined },
  { key: "role", header: copy.roster.colRole, cell: (m) => (m.admin ? copy.roster.adminTag : copy.roster.roleMember) },
  {
    key: "actions",
    header: copy.roster.colActions,
    headerHidden: true,
    align: "end",
    width: "4rem",
    cell: (m) =>
      m.admin ? null : (
        <OverflowMenu
          label={copy.roster.options(m.name)}
          className={REVEAL_ON_ROW_HOVER}
          items={[{ label: copy.members.remove, icon: UserMinus, onSelect: () => {}, destructive: true }]}
        />
      ),
  },
];

const RECEIPTS = Array.from({ length: 24 }, (_, i) => ({
  n: i + 1,
  hash: `0x${(i * 2654435761 >>> 0).toString(16).padStart(8, "0")}${SAMPLE_HASH.slice(10)}`,
  answer: i % 3 === 0 ? "No" : "Yes",
}));

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Section title={title} className="border-t border-border pt-6">
      {children}
    </Section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-overline uppercase text-text-3">{children}</p>;
}

/** Full L6 flow against the mock prover + mock relay: pick, then "Send answer" (P4). */
function VoteDemo({ kind }: { kind: "single" | "rating" }) {
  const [value, setValue] = useState<number | null>(null);
  const [phase, setPhase] = useState<VoteStatusPhase>("idle");
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulateMs, setSimulateMs] = useState(1200);
  const busy = useRef(false);

  const answerPhase: AnswerPhase = phase === "idle" ? "idle" : phase === "recorded" ? "done" : "proving";

  const pick = (v: number) => {
    if (busy.current || phase === "recorded") return;
    setValue(v);
    setError(null);
  };

  const send = async () => {
    if (busy.current || value === null) return;
    const v = value;
    busy.current = true;
    setError(null);
    setSlow(false);
    const res = await castVote(DEMO_POLL, v, {
      // Always the mock prover: DEMO_POLL isn't a real poll and has no member set.
      prover: "mock",
      simulateMs,
      onPhase: (p) => setPhase(p),
      onSlow: () => setSlow(true),
    });
    busy.current = false;
    if (res.status === "recorded") setPhase("recorded");
    else {
      setPhase("idle");
      setValue(null);
      setError(res.status === "already_answered" ? copy.vote.alreadyAnswered : copy.vote.notSent);
    }
  };

  const reset = () => {
    setPhase("idle");
    setValue(null);
    setSlow(false);
    setError(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label="Simulated proving time"
        value={String(simulateMs)}
        onValueChange={(v) => setSimulateMs(Number(v))}
        options={[
          { value: "1200", label: "1.2 s" },
          { value: "2500", label: "2.5 s" },
          { value: "5000", label: "5 s (slow)" },
        ]}
      />
      <AnonymityBanner>{copy.anonymity.bannerVote}</AnonymityBanner>
      {kind === "single" ? (
        <OptionGroup label="Saan tayo mag-retreat this sem?" options={SAMPLE_OPTIONS} value={value} onSelect={pick} phase={answerPhase} />
      ) : (
        <RatingRow label="Rate the GA last Friday" value={value} onSelect={pick} phase={answerPhase} />
      )}
      {phase !== "recorded" && (
        <Button onClick={send} disabled={value === null} loading={answerPhase === "proving"} loadingLabel={copy.vote.sending}>
          {copy.vote.send}
        </Button>
      )}
      <VoteStatus phase={phase} slow={slow} />
      {error && <Notice tone="danger" title={error} />}
      <Button variant="secondary" onClick={reset}>
        Reset demo
      </Button>
    </div>
  );
}

export function Showcase() {
  const [checked, setChecked] = useState(true);
  const [kind, setKind] = useState("single");
  const [min, setMin] = useState(8);
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <>
      <AppBar
        title="Components"
        backHref="/"
        right={<AppBarAction label="Who can see what" icon="anonymous" href="/privacy" />}
      />
      <Screen>
        <PageHeader level={2} title="Lihim components" description="Every primitive in every state. Toggle theme to check both." />
        <ThemeSelect />

        <Block title="Brand">
          <Lockup markSize={56} tagline={copy.brand.tagline} />
          <Lockup markSize={32} />
          <Wordmark size={28} />
        </Block>

        <Block title="Illustrations">
          <div className="flex flex-wrap items-end gap-4">
            {(["mark", "verified", "poll", "group"] as const).map((n) => (
              <div key={n} className="flex flex-col items-center gap-2">
                <Illustration name={n} size={96} />
                <span className="text-caption text-text-3">{n}</span>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-4">
            <Illustration name="mark" size={48} />
            <Illustration name="mark" size={64} />
            <Illustration name="mark" size={160} alt="Lihim" />
          </div>
        </Block>

        <Block title="Type scale">
          <p className="text-display">Saan tayo mag-retreat?</p>
          <p className="text-title">Screen title</p>
          <p className="text-heading">Card heading</p>
          <p className="text-body">Body text, 16/24. Sabihin ang totoo.</p>
          <p className="text-label">Label 14/20 medium</p>
          <p className="text-caption text-text-2">Caption 13/18 · text-2</p>
          <p className="text-caption text-text-3">Caption · text-3</p>
          <p className="font-mono text-mono">0x7f3a…c91e · mono 13/18</p>
          <p className="text-overline uppercase text-text-3">Overline 11 px</p>
          <p className="text-heading tabular">1,234 · 23 of 31 · 48%</p>
        </Block>

        <Block title="Colour tokens">
          <div className="grid grid-cols-3 gap-2">
            {[
              ["bg", "bg-bg"],
              ["surface", "bg-surface"],
              ["surface-raised", "bg-surface-raised"],
              ["border", "bg-border"],
              ["border-control", "bg-border-control"],
              ["accent", "bg-accent"],
              ["success", "bg-success"],
              ["warning", "bg-warning"],
              ["danger", "bg-danger"],
            ].map(([name, cls]) => (
              <div key={name} className="flex flex-col gap-1">
                <div className={`h-10 rounded-sm border border-border ${cls}`} />
                <span className="text-caption text-text-3">{name}</span>
              </div>
            ))}
          </div>
        </Block>

        <Block title="Icons (fixed mapping)">
          <ul className="grid grid-cols-3 gap-3">
            {(Object.keys(Icons) as IconName[]).map((k) => (
              <li key={k} className="flex items-center gap-2 text-label text-text-2">
                <Icon icon={k} className="text-text-1" />
                {k}
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Buttons">
          <Button>Create group</Button>
          <Button variant="secondary">Invite link</Button>
          <Button variant="destructive">Remove member</Button>
          <Button variant="ghost">Who can see what</Button>
          <Button loading loadingLabel="Creating…">
            Create group
          </Button>
          <Button disabled>Disabled</Button>
          <div className="flex gap-3">
            <Button block={false} variant="secondary">
              Inline
            </Button>
            <Button block={false}>Inline primary</Button>
          </div>
        </Block>

        <Block title="Option rows — static states">
          <div role="radiogroup" aria-label="Static option states" className="flex flex-col gap-3">
            <Label>default</Label>
            <OptionRow label="Tagaytay" selected={false} onSelect={() => {}} tabbable />
            <Label>selected</Label>
            <OptionRow label="Baguio" selected onSelect={() => {}} />
            <Label>locked + proving</Label>
            <OptionRow label="La Union" selected locked proving />
            <Label>faded</Label>
            <OptionRow label="Sa campus na lang" selected={false} locked faded />
            <Label>done</Label>
            <OptionRow label="Yes" selected locked done />
          </div>
        </Block>

        <Block title="Vote flow — single choice (live, mock prover)">
          <VoteDemo kind="single" />
        </Block>

        <Block title="Vote flow — rating (live, mock prover)">
          <VoteDemo kind="rating" />
        </Block>

        <Block title="Rating & yes/no — static">
          <RatingRow label="Static rating" value={4} onSelect={() => {}} phase="done" />
          <RatingRow label="Proving rating" value={3} onSelect={() => {}} phase="proving" />
          <OptionGroup label="Yes/No idle" options={YES_NO_OPTIONS} value={null} onSelect={() => {}} />
          <OptionGroup label="Already answered" options={YES_NO_OPTIONS} value={null} onSelect={() => {}} disabled />
          <Notice tone="danger" title={copy.vote.alreadyAnswered}>
            {copy.vote.alreadyAnsweredBody}
          </Notice>
          <Notice tone="warning" title={copy.vote.notSent} />
        </Block>

        <Block title="Vote status">
          <VoteStatus phase="proving" />
          <VoteStatus phase="proving" slow />
          <VoteStatus phase="recorded" />
        </Block>

        <Block title="Results">
          <Card className="flex flex-col gap-4">
            <p className="text-display">Yes</p>
            <ResultBar label="Yes" count={17} total={23} leading />
            <ResultBar label="No" count={6} total={23} />
            <TurnoutMeter answered={23} total={31} />
            <VerifiedBadge pollId="poll_finance" status="closed" />
          </Card>
          <Card className="flex flex-col gap-3">
            <Label>verified badge while open (R15)</Label>
            <VerifiedBadge
              pollId="poll_retreat"
              status="open"
              whileOpen={<p className="text-caption text-text-2">{copy.results.verifyAfterClose}</p>}
            />
          </Card>
          <Card className="flex flex-col gap-3">
            <p className="text-body text-text-2">{copy.results.hiddenUntil("6:00 PM")}</p>
            <TurnoutMeter answered={20} total={31} />
          </Card>
          <Card className="flex flex-col gap-4">
            <p className="text-label text-text-2">Tie</p>
            {RATING_OPTIONS.map((o) => (
              <ResultBar key={o.value} label={o.label} count={[0, 2, 5, 5, 3][o.value - 1]!} total={15} leading={o.value === 3 || o.value === 4} />
            ))}
          </Card>
        </Block>

        <Block title="Status pills">
          <div className="flex flex-wrap gap-2">
            <StatusPill status="draft" />
            <StatusPill status="didnt-open" />
            <StatusPill status="open" />
            <StatusPill status="closing-soon" />
            <StatusPill status="closed" />
          </div>
        </Block>

        <Block title="Banners & warnings">
          <AnonymityBanner />
          <AnonymityBanner>{copy.anonymity.bannerJoin}</AnonymityBanner>
          <SmallGroupWarning />
          <SmallGroupWarning
            variant="blocking"
            memberCount={6}
            minMembers={8}
            action={
              <Button variant="secondary">
                <Icon icon="invite" />
                {copy.group.invite}
              </Button>
            }
          />
          <Notice tone="success" icon="verified" title={copy.join.joined} />
          <Notice title="Info notice">Plain informational card.</Notice>
        </Block>

        <Block title="Member count">
          <MemberCountBlock count={31} caption="UP Sining" />
          <MemberCountBlock count={1} />
        </Block>

        <Block title="Hash chip">
          <HashChip value={SAMPLE_HASH} label="Receipt" />
          <HashChip value={SAMPLE_HASH} label="Member list fingerprint" head={10} tail={8} />
        </Block>

        <Block title="List rows">
          <ListRow href={`/g/${MOCK_GROUP_IDS.upsining}`} title="UP Sining" meta={copy.members.count(31)} />
          <ListRow
            href="/p/poll_retreat"
            title="Saan tayo mag-retreat this sem?"
            meta={formatClosing(NOW + 2 * 86_400_000, NOW)}
            trailing={<StatusPill status="open" />}
          />
          <Label>R10 poll card: pill in the meta row, title full width</Label>
          <ListRow
            href="/p/poll_ga_rating"
            title="Rate the GA last Friday"
            status={<StatusPill status="closing-soon" />}
            meta={<span className="tabular">{formatClosing(NOW + 5 * 3_600_000, NOW)} · 16 of 31 answered</span>}
            trailing={null}
          />
          <ListRow
            href={`/g/${MOCK_GROUP_IDS.upsining}`}
            title="UP Sining"
            meta={copy.members.count(31)}
            trailing={
              <span className="flex shrink-0 items-center gap-2">
                <CountBadge count={2} label={copy.shell.openPollsBadge(2)} />
                <span className="text-caption text-text-3">{copy.group.adminTag}</span>
              </span>
            }
          />
          <ListRow
            title="Paolo Santos"
            meta="Joined Oct 2, 2026"
            trailing={
              <OverflowMenu
                label={copy.roster.options("Paolo Santos")}
                items={[{ label: copy.members.remove, icon: UserMinus, onSelect: () => {}, destructive: true }]}
              />
            }
          />
          <SkeletonList count={2} />
        </Block>

        <Block title="Status rows (L3 Opening, L4 Adding members)">
          <StatusRow state="running" title={copy.pollOpening.opening} body={copy.pollOpening.openingMeta} />
          <StatusRow state="running" title={copy.addingMembers.running(3)} body={copy.addingMembers.runningBody} />
          <StatusRow state="done" title={copy.addingMembers.done(3)} />
          <StatusRow
            state="failed"
            title={copy.pollOpening.didntOpen}
            body="Officer evaluation: Treasurer"
            action={
              <Button variant="secondary" block={false}>
                {copy.pollOpening.retry}
              </Button>
            }
            trailing={
              <OverflowMenu
                label={copy.pollOpening.options("Officer evaluation: Treasurer")}
                items={[{ label: copy.pollOpening.discard, onSelect: () => {}, destructive: true }]}
              />
            }
          />
          <StatusRow
            state="failed"
            title={copy.addingMembers.failed(3)}
            body={copy.addingMembers.failedBody}
            action={
              <Button variant="secondary" block={false}>
                {copy.addingMembers.retry}
              </Button>
            }
          />
        </Block>

        <Block title="Data table (L4 roster, L9 answers at ≥ lg)">
          <DataTable
            caption={copy.roster.listLabel}
            columns={MEMBER_COLUMNS}
            rows={DEMO_MEMBERS}
            rowKey={(m) => m.id}
            defaultSort={{ key: "name", direction: "ascending" }}
          />
          <DataTable
            caption={copy.verify.tableCaption}
            captionVisible
            mono
            maxHeight="20rem"
            rows={RECEIPTS}
            rowKey={(r) => String(r.n)}
            columns={[
              { key: "n", header: copy.verify.colIndex, cell: (r) => r.n, width: "3rem" },
              { key: "receipt", header: copy.verify.colReceipt, cell: (r) => <HashChip value={r.hash} label={copy.verify.colReceipt} /> },
              { key: "answer", header: copy.verify.colAnswer, cell: (r) => <span className="font-sans">{r.answer}</span>, align: "end" },
            ]}
          />
        </Block>

        <Block title="Footer links (R14, compact/medium)">
          <FooterLinks settings />
        </Block>

        <Block title="Desktop shell pieces">
          <p className="text-caption text-text-3">
            The page header only shows through Screen&apos;s header band at ≥ lg inside a shell; previewed here directly. See
            any /g/… page at 1024 px+ for the sidebar.
          </p>
          <Card>
            <ShellHeader
              back={{ href: `/g/${MOCK_GROUP_IDS.upsining}`, label: "UP Sining" }}
              title={copy.roster.title}
              context={`${copy.members.count(31)} · ${copy.members.rosterNote}`}
              actions={<Button>{copy.roster.inviteCta}</Button>}
            />
          </Card>
          <FocusedTopBar className="relative rounded-lg border" />
        </Block>

        <Block title="Empty states">
          <EmptyState illustration="mark" title={copy.home.emptyTitle} body={copy.home.emptyBody} />
          <EmptyState
            illustration="poll"
            title={copy.group.noPollsTitle}
            body={copy.group.noPollsAdminBody}
            action={<Button variant="secondary">{copy.group.newPoll}</Button>}
          />
          {/* No hero: for screens that already spent their one illustration (L3). */}
          <EmptyState title={copy.hub.noPastTitle} body={copy.hub.noPastBody} />
        </Block>

        <Block title="Form controls">
          <TextField label="Group name" placeholder="UP Sining" counter="9/60" />
          <TextField label="With error" defaultValue="" error="Lagyan ng pangalan ang group." />
          <TextArea label="Description" hint="Optional. Members see this on the invite." />
          <Stepper label="Minimum group size" value={min} onChange={setMin} min={5} max={500} unit="members" hint={copy.smallGroup.minSizeHelp} />
          <SegmentedControl
            label="Poll type"
            value={kind}
            onValueChange={setKind}
            options={[
              { value: "single", label: copy.poll.kindSingle },
              { value: "yesno", label: copy.poll.kindYesNo },
              { value: "rating", label: copy.poll.kindRating },
            ]}
          />
          <Switch checked={checked} onCheckedChange={setChecked} label={copy.poll.hideResults} description={copy.poll.hideResultsHelp} />
          <Switch checked={false} onCheckedChange={() => {}} label="Disabled switch" disabled />
        </Block>

        <Block title="Sheets & toast">
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            Open sheet
          </Button>
          <Sheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            title="Example sheet"
            description="Bottom sheet below 768 px, centred 480 px dialog above. Focus-trapped, Esc closes."
          >
            <p className="text-body text-text-2">Sheet body content.</p>
          </Sheet>
          <ConfirmSheet
            trigger={<Button variant="destructive">{copy.members.remove}</Button>}
            title={copy.members.removeTitle("Paolo Santos")}
            body={copy.members.removeBody}
            confirmLabel={copy.members.removeConfirm}
            destructive
            onConfirm={async () => {
              await new Promise((r) => setTimeout(r, 600));
              notify(copy.members.removed("Paolo Santos"));
            }}
          />
          <Button variant="secondary" onClick={() => notify(copy.group.inviteCopied)}>
            Show toast
          </Button>
          <Button variant="secondary" onClick={() => notify.success(copy.vote.recorded)}>
            Show success toast
          </Button>
        </Block>
      </Screen>
    </>
  );
}
