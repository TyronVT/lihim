"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  FocusedTopBar,
  HashChip,
  HIDE_IN_SHELL_LG,
  Icon,
  Notice,
  PageHeader,
  ResultBar,
  Screen,
  Section,
  ShellHeader,
  Skeleton,
  TurnoutMeter,
  type DataTableColumn,
} from "@/components";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { repo, type AuditRow, type Poll, type PollAudit, type PollOption, type PollResultRow } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";
import { env } from "@/lib/env";
import { formatCount, formatDate, formatTime } from "@/lib/format";
import { optionLabel } from "@/lib/poll";

const PAGE_SIZE = 50;

/** Desktop answers panel: scrolls inside itself past 20 rows (56 px rows + the header row). */
const TABLE_MAX_HEIGHT = "calc(21 * 3.5rem)";

/**
 * What the public record has for this link:
 * - closed: the full audit (recount + every answer)
 * - open:   still open, turnout only (the record is published when it closes)
 * - missing: no poll with this link (or one this page may not show, e.g. a draft)
 */
type PublicRecord =
  | { kind: "closed"; audit: PollAudit }
  | { kind: "open"; poll: Poll }
  | { kind: "missing" };

/**
 * `getPollAudit` only knows closed polls, so "still open" vs "not found" is told apart with
 * `getPoll`. That read is members-only (RLS), so a signed-out visitor on Supabase sees an open
 * poll as "not found" until the public view exposes open polls' status, closing time and turnout.
 */
async function loadRecord(pollId: string): Promise<PublicRecord> {
  const audit = await repo.getPollAudit(pollId);
  if (audit) return { kind: "closed", audit };
  const poll = await repo.getPoll(pollId).catch(() => null);
  if (poll?.status === "open") return { kind: "open", poll };
  return { kind: "missing" };
}

/**
 * Tally rebuilt on this device from the individual answers, so the page doesn't just
 * repeat a number the server handed it.
 *
 * TODO(M2): `getPollAudit` reads the `public_poll_audit` view (or the mock). For the footer's
 * promise to be literally true, rebuild `rows` client-side from Stellar RPC `getEvents`
 * ("voted", poll_id) → (nullifier, choice) on LihimPolls (env.stellarRpcUrl / pollsContractId)
 * and check `frozenRoot`/`frozenSize` against the "poll_created" event.
 */
function recount(audit: PollAudit) {
  const counts = new Map<number, number>();
  let unknown = 0;
  const known = new Set(audit.options.map((o) => o.value));
  for (const row of audit.rows) {
    if (!known.has(row.choice)) unknown++;
    else counts.set(row.choice, (counts.get(row.choice) ?? 0) + 1);
  }
  const tally: PollResultRow[] = audit.options.map((o) => ({ ...o, count: counts.get(o.value) ?? 0 }));
  const counted = audit.rows.length - unknown;
  const published = new Map(audit.tally.map((r) => [r.value, r.count]));
  const matches =
    unknown === 0 &&
    audit.votersCount === audit.rows.length &&
    tally.every((r) => published.get(r.value) === r.count);
  const max = Math.max(0, ...tally.map((r) => r.count));
  const leading = max === 0 ? [] : tally.filter((r) => r.count === max).map((r) => r.value);
  return { tally, counted, unknown, matches, leading, published };
}

function answerLabel(audit: PollAudit, choice: number, options: PollOption[]): string {
  if (!options.some((o) => o.value === choice)) return copy.verify.answerUnknown;
  return audit.kind === "rating" ? copy.vote.ratingAria(choice) : optionLabel(options, choice);
}

function rowLabel(audit: PollAudit, row: PollResultRow): string {
  return audit.kind === "rating" ? copy.vote.ratingAria(row.value) : row.label;
}

/** Explorer link for the polls contract, derived from the configured tx base. */
function contractUrl(contractId: string): string | null {
  if (!env.explorerTxUrl || !contractId) return null;
  return `${env.explorerTxUrl.replace(/\/tx\/?$/, "/contract/")}${encodeURIComponent(contractId)}`;
}

/**
 * L9 — Verify this poll (public, no session, no cookies). Compact: the focused top bar (R8)
 * instead of an AppBar, then the compact order. ≥ lg (focused shell, 960): ShellHeader with the
 * question and the intro line, the summary in one row, tally and every answer side by side.
 */
export function VerifyScreen({ pollId }: { pollId: string }) {
  const query = useQuery(() => loadRecord(pollId), [pollId]);
  const record = query.status === "success" ? query.data : null;

  const title = record?.kind === "closed" ? record.audit.title : record?.kind === "open" ? record.poll.title : copy.verify.title;
  const context = record?.kind === "closed" ? `${record.audit.groupName} · ${copy.verify.intro}` : copy.verify.intro;

  return (
    <>
      <FocusedTopBar className="lg:hidden" />
      <Screen wide header={<ShellHeader title={title} context={context} />}>
        {query.status === "loading" && <Recounting />}
        {query.status === "error" && (
          <>
            <IntroHeader title={copy.verify.title} />
            <Notice
              tone="danger"
              title={copy.verify.unreachable}
              action={
                <Button variant="secondary" icon="retry" onClick={query.reload}>
                  {copy.verify.retry}
                </Button>
              }
            />
          </>
        )}
        {record?.kind === "missing" && (
          <>
            <h1 className="sr-only lg:hidden">{copy.verify.title}</h1>
            <EmptyState illustration="verified" title={copy.verify.notFound} />
          </>
        )}
        {record?.kind === "open" && <StillOpen poll={record.poll} />}
        {record?.kind === "closed" && <AuditView audit={record.audit} />}
      </Screen>
    </>
  );
}

/**
 * Compact heading block: the h1 (the top bar has none), the group, and the R8 intro line.
 * Hidden at ≥ lg, where the ShellHeader shows the same things.
 */
function IntroHeader({ title, groupName, illustration }: { title: string; groupName?: string; illustration?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-3", HIDE_IN_SHELL_LG)}>
      <PageHeader level={1} illustration={illustration ? "verified" : undefined} title={title} description={groupName} />
      <p className="text-body text-text-2">{copy.verify.intro}</p>
    </div>
  );
}

/** Recounting: skeletons in the final layout, tally skeleton + "Recounting from the public record…". */
function Recounting() {
  return (
    <>
      <div className={cn("flex flex-col gap-3", HIDE_IN_SHELL_LG)}>
        <Skeleton className="size-16" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-5 w-full" />
      </div>
      <Skeleton className="h-36 lg:h-24" />
      <div className="grid grid-cols-1 gap-section lg:grid-cols-2">
        <Section title={copy.verify.recounted}>
          <Card className="flex flex-col gap-5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </Card>
          <p role="status" className="text-label text-text-2">
            {copy.verify.recounting}
          </p>
        </Section>
        <Skeleton className="hidden h-80 lg:block" />
      </div>
    </>
  );
}

/** Still open: the record isn't complete yet, so turnout only (safe to show live). */
function StillOpen({ poll }: { poll: Poll }) {
  const when = `${formatDate(poll.closesAt)}, ${formatTime(poll.closesAt)}`;
  return (
    <>
      <IntroHeader title={poll.title} illustration />
      <Notice tone="info" icon="closing" title={copy.verify.stillOpen(when)}>
        <TurnoutMeter answered={poll.votersCount} total={poll.frozenSize} className="mt-2" />
      </Notice>
    </>
  );
}

function AuditView({ audit }: { audit: PollAudit }) {
  const result = useMemo(() => recount(audit), [audit]);
  const link = contractUrl(audit.contractId);

  return (
    <>
      <IntroHeader title={audit.title} groupName={audit.groupName} illustration />

      <Section title={copy.verify.summary}>
        <Card className="flex flex-col gap-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto] lg:gap-x-6">
            <SummaryItem term={copy.verify.closedOn}>
              {formatDate(audit.closedAt)}, {formatTime(audit.closedAt)}
            </SummaryItem>
            <SummaryItem term={copy.verify.membersAtOpen}>
              <span className="tabular">{formatCount(audit.frozenSize)}</span>
            </SummaryItem>
            <SummaryItem term={copy.verify.answers}>
              <span className="tabular">{formatCount(audit.votersCount)}</span>
            </SummaryItem>
            <SummaryItem term={copy.verify.groupFingerprint} className="col-span-2 sm:col-span-3 lg:col-span-1">
              <HashChip value={audit.frozenRoot} label={copy.verify.groupFingerprint} head={10} tail={8} />
            </SummaryItem>
          </dl>
        </Card>
      </Section>

      <div className="grid grid-cols-1 gap-section lg:grid-cols-2 lg:items-start">
        <Section title={copy.verify.recounted}>
          <Card className="flex flex-col gap-5">
            {result.tally.map((row) => (
              <ResultBar
                key={row.value}
                label={rowLabel(audit, row)}
                count={row.count}
                total={result.counted}
                leading={result.leading.includes(row.value)}
              />
            ))}
          </Card>
          {result.matches ? (
            <p role="status" className="flex items-start gap-2 text-label text-success">
              <Icon icon="verified" className="mt-0.5 shrink-0" />
              {copy.verify.recountMatches}
            </p>
          ) : (
            <Mismatch audit={audit} result={result} />
          )}
        </Section>

        <AnswerList audit={audit} />
      </div>

      <footer className="flex flex-col gap-3 border-t border-border pt-6">
        <p className="text-label text-text-1">
          {copy.verify.footer}
          <sup aria-hidden className="ml-0.5 text-text-3">
            1
          </sup>
        </p>
        <p className="text-caption text-text-3">
          <span aria-hidden>1 </span>
          {copy.verify.footnote}{" "}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-2 underline underline-offset-4 hover:text-text-1"
            >
              {copy.verify.footnoteLink}
              {/* Outside link: trailing, sized to the caption line. */}
              <Icon icon="external" size={14} className="ml-0.5 inline-block align-[-2px]" />
            </a>
          )}
        </p>
        <p className="font-mono text-mono text-text-3">{copy.verify.recordRef(audit.chainPollId)}</p>
      </footer>
    </>
  );
}

/** Mismatch: `--danger` card, both numbers per option ("Lihim shows" vs "Recount"). */
function Mismatch({ audit, result }: { audit: PollAudit; result: ReturnType<typeof recount> }) {
  return (
    <Notice tone="danger" title={copy.verify.mismatchTitle}>
      <table className="mt-2 w-full border-collapse text-left text-label">
        <caption className="sr-only">{copy.verify.mismatchTitle}</caption>
        <thead>
          <tr className="border-b border-border text-caption text-text-2">
            <th scope="col" className="py-2 pr-3 font-normal">
              {copy.verify.colAnswer}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-normal">
              {copy.verify.mismatchShown}
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              {copy.verify.mismatchRecount}
            </th>
          </tr>
        </thead>
        <tbody>
          {result.tally.map((row) => {
            const shown = result.published.get(row.value) ?? 0;
            return (
              <tr key={row.value} className="border-b border-border last:border-b-0">
                <th scope="row" className="py-2 pr-3 font-normal text-text-1">
                  {rowLabel(audit, row)}
                </th>
                <td className="py-2 pr-3 text-right tabular text-text-1">{formatCount(shown)}</td>
                <td className={cn("py-2 text-right tabular", shown === row.count ? "text-text-1" : "text-danger")}>
                  {formatCount(row.count)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {result.unknown > 0 && <span className="mt-2 block">{copy.verify.unknownAnswers(result.unknown)}</span>}
    </Notice>
  );
}

function SummaryItem({ term, children, className }: { term: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <dt className="text-caption text-text-2">{term}</dt>
      <dd className="text-body text-text-1">{children}</dd>
    </div>
  );
}

/**
 * "Every answer": compact keeps the "Show all" expand (paged in 50s); ≥ lg shows the DataTable
 * right away, scrolling inside its panel past 20 rows. Only one is displayed at a time.
 */
function AnswerList({ audit }: { audit: PollAudit }) {
  const total = audit.rows.length;
  return (
    <Section title={copy.verify.tableTitle} action={<span className="hidden text-label text-text-2 tabular lg:inline">{formatCount(total)}</span>}>
      {total === 0 ? (
        <p className="text-body text-text-2">{copy.verify.noRows}</p>
      ) : (
        <>
          <div className="lg:hidden">
            <AnswerTable audit={audit} />
          </div>
          <div className="hidden flex-col gap-3 lg:flex">
            <p className="text-caption text-text-2">{copy.verify.tableCaption}</p>
            <AnswerDataTable audit={audit} />
          </div>
        </>
      )}
    </Section>
  );
}

type IndexedRow = AuditRow & { index: number };

function AnswerDataTable({ audit }: { audit: PollAudit }) {
  const rows = useMemo<IndexedRow[]>(() => audit.rows.map((r, i) => ({ ...r, index: i + 1 })), [audit.rows]);
  const columns: DataTableColumn<IndexedRow>[] = [
    {
      key: "index",
      header: copy.verify.colIndex,
      width: "4rem",
      sortValue: (r) => r.index,
      cell: (r) => <span className="font-mono text-mono text-text-3 tabular">{r.index}</span>,
    },
    {
      key: "receipt",
      header: copy.verify.colReceipt,
      cell: (r) => <HashChip value={r.nullifier} label={`${copy.verify.colReceipt} ${r.index}`} />,
    },
    {
      key: "answer",
      header: copy.verify.colAnswer,
      align: "end",
      sortValue: (r) => answerLabel(audit, r.choice, audit.options),
      cell: (r) => <span className="text-label text-text-1">{answerLabel(audit, r.choice, audit.options)}</span>,
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.nullifier}
      caption={copy.verify.tableTitle}
      maxHeight={TABLE_MAX_HEIGHT}
    />
  );
}

/** Compact: # · receipt · answer. Collapsed by default; pages in 50s so big groups stay smooth. */
function AnswerTable({ audit }: { audit: PollAudit }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const regionId = useId();
  const total = audit.rows.length;
  const rows = audit.rows.slice(0, shown);

  return (
    <div className="flex flex-col gap-card-gap">
      <Button variant="secondary" aria-expanded={open} aria-controls={regionId} onClick={() => setOpen((o) => !o)}>
        {open ? copy.verify.hideTable : copy.verify.showTable(total)}
        <Icon icon="chevronDown" className={cn("transition-transform duration-base ease-standard", open && "rotate-180")} />
      </Button>
      <div id={regionId} hidden={!open} className="flex flex-col gap-3">
        <p className="text-caption text-text-2">{copy.verify.tableCaption}</p>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{copy.verify.tableTitle}</caption>
            <thead>
              <tr className="border-b border-border text-caption text-text-2">
                <th scope="col" className="w-12 px-3 py-2 font-normal">
                  {copy.verify.colIndex}
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  {copy.verify.colReceipt}
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  {copy.verify.colAnswer}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.nullifier} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-mono text-mono text-text-3 tabular">{i + 1}</td>
                  <td className="px-3 py-2">
                    <HashChip value={row.nullifier} label={`${copy.verify.colReceipt} ${i + 1}`} />
                  </td>
                  <td className="px-3 py-2 text-label text-text-1">{answerLabel(audit, row.choice, audit.options)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown < total && (
          <Button variant="ghost" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            {copy.verify.showMore(Math.min(PAGE_SIZE, total - shown))}
          </Button>
        )}
      </div>
    </div>
  );
}
