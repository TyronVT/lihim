"use client";

import { ChevronDown } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import {
  AppBar,
  Button,
  Card,
  EmptyState,
  HashChip,
  Icon,
  Notice,
  PageHeader,
  ResultBar,
  Screen,
  Section,
  Skeleton,
} from "@/components";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { repo, type PollAudit, type PollOption, type PollResultRow } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";
import { env } from "@/lib/env";
import { formatCount, formatDate, formatTime } from "@/lib/format";
import { optionLabel } from "@/lib/poll";

const PAGE_SIZE = 50;

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
  return { tally, counted, unknown, matches, leading };
}

function answerLabel(audit: PollAudit, choice: number, options: PollOption[]): string {
  if (!options.some((o) => o.value === choice)) return copy.verify.answerUnknown;
  return audit.kind === "rating" ? copy.vote.ratingAria(choice) : optionLabel(options, choice);
}

/** Explorer link for the polls contract, derived from the configured tx base. */
function contractUrl(contractId: string): string | null {
  if (!env.explorerTxUrl || !contractId) return null;
  return `${env.explorerTxUrl.replace(/\/tx\/?$/, "/contract/")}${encodeURIComponent(contractId)}`;
}

export function VerifyScreen({ pollId }: { pollId: string }) {
  const query = useQuery(() => repo.getPollAudit(pollId), [pollId]);

  return (
    <>
      <AppBar title={copy.verify.title} wide />
      <Screen wide>
        {query.status === "loading" && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{copy.common.loading}</span>
            <Skeleton className="size-16" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-48" />
          </div>
        )}
        {query.status === "error" && (
          <Notice
            tone="danger"
            title={copy.errors.generic}
            action={
              <Button variant="secondary" onClick={query.reload}>
                {copy.common.retry}
              </Button>
            }
          />
        )}
        {query.status === "success" && !query.data && (
          // The public view only has closed polls; an unknown id lands here too, on purpose.
          <EmptyState illustration="verified" title={copy.verify.notAvailableTitle} body={copy.verify.notClosed} />
        )}
        {query.status === "success" && query.data && <AuditView audit={query.data} />}
      </Screen>
    </>
  );
}

function AuditView({ audit }: { audit: PollAudit }) {
  const result = useMemo(() => recount(audit), [audit]);
  const link = contractUrl(audit.contractId);

  return (
    <>
      <PageHeader illustration="verified" title={audit.title} description={audit.groupName} />

      <Section title={copy.verify.summary}>
        <Card className="flex flex-col gap-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            <SummaryItem term={copy.verify.closedOn}>
              {formatDate(audit.closedAt)}, {formatTime(audit.closedAt)}
            </SummaryItem>
            <SummaryItem term={copy.verify.membersAtOpen}>
              <span className="tabular">{formatCount(audit.frozenSize)}</span>
            </SummaryItem>
            <SummaryItem term={copy.verify.answers}>
              <span className="tabular">{formatCount(audit.votersCount)}</span>
            </SummaryItem>
            <SummaryItem term={copy.verify.groupFingerprint} className="col-span-2 sm:col-span-3">
              <HashChip value={audit.frozenRoot} label={copy.verify.groupFingerprint} head={10} tail={8} />
            </SummaryItem>
          </dl>
        </Card>
      </Section>

      <Section title={copy.verify.recounted}>
        <Card className="flex flex-col gap-5">
          {result.tally.map((row) => (
            <ResultBar
              key={row.value}
              label={audit.kind === "rating" ? copy.vote.ratingAria(row.value) : row.label}
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
          <Notice tone="danger" title={copy.verify.recountMismatch}>
            {copy.verify.recountMismatchBody}
            {result.unknown > 0 && <span className="mt-1 block">{copy.verify.unknownAnswers(result.unknown)}</span>}
          </Notice>
        )}
      </Section>

      <AnswerTable audit={audit} />

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
            </a>
          )}
        </p>
        <p className="font-mono text-mono text-text-3">{copy.verify.recordRef(audit.chainPollId)}</p>
      </footer>
    </>
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

/** # · receipt · answer. Collapsed by default; pages in 50s so big groups stay smooth. */
function AnswerTable({ audit }: { audit: PollAudit }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const regionId = useId();
  const total = audit.rows.length;
  const rows = audit.rows.slice(0, shown);

  return (
    <Section title={copy.verify.tableTitle}>
      {total === 0 ? (
        <p className="text-body text-text-2">{copy.verify.noRows}</p>
      ) : (
        <>
          <Button
            variant="secondary"
            aria-expanded={open}
            aria-controls={regionId}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? copy.verify.hideTable : copy.verify.showTable(total)}
            <Icon
              icon={ChevronDown}
              className={cn("transition-transform duration-base ease-standard", open && "rotate-180")}
            />
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
        </>
      )}
    </Section>
  );
}
