"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AppBar,
  Button,
  ConfirmSheet,
  EmptyState,
  FooterLinks,
  HIDE_IN_SHELL_LG,
  Icon,
  ListRow,
  MemberCountBlock,
  Notice,
  OverflowMenu,
  Screen,
  Section,
  ShellHeader,
  SkeletonList,
  StatusPill,
  StatusRow,
  notify,
  useShell,
  type OverflowMenuItem,
} from "@/components";
import { hasAnswered } from "@/lib/answered";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";
import { PollClosingPassedError, repo, type Group, type Poll } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";
import { formatClosing } from "@/lib/format";
import { forgetLastGroup } from "@/lib/last-group";
import { pollDisplayStatus, type PollDisplayStatus } from "@/lib/poll";
import { GroupSwitcher } from "./group-switcher";
import { InviteSheet } from "./invite-sheet";
import { GroupError, GroupLoading, GroupNotFound } from "./states";

/** Re-read the poll list this often while a poll is still opening (P6; the tx usually lands in seconds). */
const OPENING_POLL_MS = 5_000;

// Desktop-only parts of the overview (the ShellHeader and sidebar cover the rest there).
const SHOW_FLEX_IN_SHELL_LG = "hidden lg:[[data-shell]_&]:flex";
const SHOW_FLEX_IN_SHELL_XL = "hidden xl:[[data-shell]_&]:flex";

const groupHref = (id: string) => `/g/${encodeURIComponent(id)}`;

/**
 * L3 — group home, the hub. No back button: screens below it come back here.
 * Compact: switcher title, overview block, admin tiles, polls. Expanded: ShellHeader with
 * "Invite link" + the "New poll" primary (admin), overview as a strip above the polls, and as
 * the right rail at ≥ xl.
 */
export function GroupHome({ groupId }: { groupId: string }) {
  const group = useQuery(() => repo.getGroup(groupId), [groupId]);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const data = group.status === "success" ? group.data : null;
  const canLeave = data !== null && data.role !== "admin";

  const title = data ? <GroupSwitcher groupId={groupId} groupName={data.name} /> : copy.hub.title;
  const leaveItem: OverflowMenuItem = {
    label: copy.leaveGroup.menuItem,
    icon: LogOut,
    onSelect: () => setLeaveOpen(true),
    destructive: true,
  };

  return (
    <>
      <AppBar
        title={title}
        right={canLeave && <OverflowMenu label={copy.hub.groupOptions} items={[leaveItem]} />}
      />
      {data ? (
        <HubScreen group={data} leaveItem={leaveItem} onLeave={() => setLeaveOpen(true)} />
      ) : (
        <Screen header={<ShellHeader title={copy.hub.title} />}>
          {group.status === "loading" ? (
            <GroupLoading />
          ) : group.status === "error" ? (
            <GroupError error={group.error} groupId={groupId} onRetry={group.reload} />
          ) : (
            // getGroup resolves null for "not found" and "not a member" alike — one state for both.
            <GroupNotFound />
          )}
        </Screen>
      )}
      {data && canLeave && <LeaveGroupSheet group={data} open={leaveOpen} onOpenChange={setLeaveOpen} />}
    </>
  );
}

function HubScreen({ group, leaveItem, onLeave }: { group: Group; leaveItem: OverflowMenuItem; onLeave: () => void }) {
  const isAdmin = group.role === "admin";
  const polls = useQuery(() => repo.listPolls(group.id), [group.id]);

  // P6: a new poll comes back as a pending draft and opens when its transaction lands.
  const opening =
    polls.status === "success" && polls.data.some((p) => p.status === "draft" && p.openState === "pending");
  const reloadPolls = polls.reload;
  const { refreshGroups } = useShell();
  useEffect(() => {
    if (!opening) return;
    const timer = window.setInterval(reloadPolls, OPENING_POLL_MS);
    return () => {
      window.clearInterval(timer);
      // Done opening (or leaving the page): the sidebar's open-poll badge may have changed.
      refreshGroups();
    };
  }, [opening, reloadPolls, refreshGroups]);

  const context = `${copy.members.count(group.memberCount)} · ${
    isAdmin ? copy.group.adminContext : copy.hub.memberCaption(group.createdByName)
  }`;

  const header = (
    <ShellHeader
      title={group.name}
      context={context}
      actions={
        isAdmin ? (
          <>
            <InviteSheet
              groupId={group.id}
              groupName={group.name}
              trigger={
                <Button variant="secondary">
                  <Icon icon="invite" />
                  {copy.group.invite}
                </Button>
              }
            />
            <Button asChild>
              <Link href={`${groupHref(group.id)}/polls/new`}>
                <Icon icon="poll" />
                {copy.group.newPoll}
              </Link>
            </Button>
          </>
        ) : (
          // Members get no primary. Leave group sits in the rail at ≥ xl, here between lg and xl.
          <OverflowMenu label={copy.hub.groupOptions} items={[leaveItem]} className="xl:hidden" />
        )
      }
    />
  );

  return (
    <Screen
      header={header}
      rail={<Overview group={group} onLeave={onLeave} />}
      railPlacement="before"
      railLabel={copy.hub.overviewLabel}
    >
      {polls.status === "loading" ? (
        <SkeletonList count={3} />
      ) : polls.status === "error" ? (
        <Notice
          tone="danger"
          title={copy.errors.generic}
          action={
            <Button variant="secondary" onClick={polls.reload}>
              {copy.common.retry}
            </Button>
          }
        />
      ) : (
        <PollSections group={group} polls={polls.data} onChanged={polls.reload} />
      )}

      <FooterLinks />
    </Screen>
  );
}

/**
 * Member count, description and (admin) the action tiles. Compact: the block above the polls,
 * as before. ≥ lg: a strip above the polls with "Manage members"; ≥ xl: the right rail, which
 * adds "Who can see what" and, for members, "Leave group" (P3).
 */
function Overview({ group, onLeave }: { group: Group; onLeave: () => void }) {
  const isAdmin = group.role === "admin";
  return (
    <>
      <section aria-label={copy.members.count(group.memberCount)} className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between xl:flex-col xl:items-stretch">
          <MemberCountBlock
            count={group.memberCount}
            caption={isAdmin ? copy.hub.adminCaption : copy.hub.memberCaption(group.createdByName)}
          />
          {isAdmin && (
            <Button asChild variant="secondary" block={false} className={cn(SHOW_FLEX_IN_SHELL_LG, "xl:w-full")}>
              <Link href={`${groupHref(group.id)}/members`}>
                <Icon icon="members" />
                {copy.group.manageMembers}
              </Link>
            </Button>
          )}
        </div>
        {group.description && (
          <div className="flex flex-col gap-1">
            <h2 className="hidden text-overline font-medium text-text-3 uppercase lg:[[data-shell]_&]:block">
              {copy.group.about}
            </h2>
            <p className="text-body text-text-2">{group.description}</p>
          </div>
        )}
        <p className="hidden text-caption text-text-3 lg:[[data-shell]_&]:block">{copy.group.minSize(group.minMembers)}</p>
      </section>

      {isAdmin && <AdminActions group={group} />}

      <div className={cn(SHOW_FLEX_IN_SHELL_XL, "flex-col border-t border-border pt-2")}>
        <Link
          href="/privacy"
          className="flex min-h-12 items-center gap-3 rounded-md px-1 text-label text-text-2 transition-colors duration-fast hover:text-text-1"
        >
          <Icon icon="anonymous" className="shrink-0" />
          {copy.shell.privacy}
        </Link>
        {group.role !== "admin" && (
          <button
            type="button"
            onClick={onLeave}
            className="flex min-h-12 items-center gap-3 rounded-md px-1 text-left text-label text-danger transition-colors duration-fast hover:bg-surface"
          >
            <Icon icon={LogOut} className="shrink-0" />
            {copy.leaveGroup.menuItem}
          </button>
        )}
      </div>
    </>
  );
}

/** The admin's second row: Members, New poll, Invite link (equal tiles so all three fit at 360 px). Compact/medium only. */
function AdminActions({ group }: { group: Group }) {
  const base = groupHref(group.id);
  const tile = "min-h-16 flex-col gap-1 px-2 text-center";
  return (
    <nav aria-label={copy.hub.adminActions} className={HIDE_IN_SHELL_LG}>
      <ul className="grid grid-cols-3 gap-2">
        <li>
          <Button asChild variant="secondary" className={tile}>
            <Link href={`${base}/members`}>
              <Icon icon="members" />
              {copy.group.members}
            </Link>
          </Button>
        </li>
        <li>
          <Button asChild variant="secondary" className={tile}>
            <Link href={`${base}/polls/new`}>
              <Icon icon="poll" />
              {copy.group.newPoll}
            </Link>
          </Button>
        </li>
        <li>
          <InviteSheet
            groupId={group.id}
            groupName={group.name}
            trigger={
              <Button variant="secondary" className={tile}>
                <Icon icon="invite" />
                {copy.group.invite}
              </Button>
            }
          />
        </li>
      </ul>
    </nav>
  );
}

function PollSections({ group, polls, onChanged }: { group: Group; polls: Poll[]; onChanged: () => void }) {
  const isAdmin = group.role === "admin";
  // Status is derived with Date.now(); safe here because poll data only arrives client-side.
  const withStatus = polls.map((p) => ({ poll: p, status: pollDisplayStatus(p) }));
  const open = withStatus
    .filter((x) => x.status === "open" || x.status === "closing-soon")
    .sort((a, b) => a.poll.closesAt.localeCompare(b.poll.closesAt));
  const past = withStatus
    .filter((x) => x.status === "closed")
    .sort((a, b) => b.poll.closesAt.localeCompare(a.poll.closesAt));
  const drafts = isAdmin ? polls.filter((p) => p.status === "draft") : [];

  return (
    <>
      <Section title={copy.group.openPolls}>
        {open.length === 0 ? (
          <EmptyState
            title={copy.group.noPollsTitle}
            body={isAdmin ? copy.group.noPollsAdminBody : copy.group.noPollsBody}
            action={
              isAdmin && (
                <Button asChild variant="secondary">
                  <Link href={`${groupHref(group.id)}/polls/new`}>{copy.hub.newPollCta}</Link>
                </Button>
              )
            }
          />
        ) : (
          // Already answered on this device → straight to results (device-local memory only).
          <PollList
            items={open}
            href={(p) => `/p/${encodeURIComponent(p.id)}${hasAnswered(p.id) ? "/results" : ""}`}
          />
        )}
      </Section>

      {drafts.length > 0 && (
        <Section title={copy.pollOpening.sectionTitle}>
          <ul className="flex flex-col gap-card-gap">
            {drafts.map((poll) => (
              <li key={poll.id}>
                <OpeningRow poll={poll} onChanged={onChanged} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={copy.group.pastResults}>
        {past.length === 0 ? (
          <EmptyState title={copy.hub.noPastTitle} body={copy.hub.noPastBody} />
        ) : (
          <PollList items={past} href={(p) => `/p/${encodeURIComponent(p.id)}/results`} />
        )}
      </Section>
    </>
  );
}

/** R10 poll card: title gets the full width; pill · closing time · turnout share the meta row. */
function PollList({ items, href }: { items: { poll: Poll; status: PollDisplayStatus }[]; href: (p: Poll) => string }) {
  return (
    <ul className="flex flex-col gap-card-gap">
      {items.map(({ poll, status }) => (
        <li key={poll.id}>
          <ListRow
            href={href(poll)}
            title={poll.title}
            status={<StatusPill status={status} />}
            meta={
              <>
                <span>{formatClosing(poll.closesAt)}</span>
                <span aria-hidden className="text-text-3">
                  ·
                </span>
                {/* Turnout only — safe to show live; never who answered. */}
                <span className="tabular text-text-3">{copy.hub.cardTurnout(poll.votersCount, poll.frozenSize)}</span>
              </>
            }
            trailing={null}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * P6 "Opening" row (admin only): a poll whose create transaction is in flight ("Opening…",
 * indeterminate line) or failed ("Didn't open" + "Try again", ⋯ → "Discard"). Never "Draft".
 */
function OpeningRow({ poll, onChanged }: { poll: Poll; onChanged: () => void }) {
  const [retrying, setRetrying] = useState(false);
  const [closingPassed, setClosingPassed] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const failed = poll.openState === "failed";

  const retry = async () => {
    setRetrying(true);
    try {
      await repo.retryPoll(poll.id);
    } catch (e) {
      if (e instanceof PollClosingPassedError) setClosingPassed(true);
      else notify.error(copy.pollOpening.retryFailed);
      return;
    } finally {
      setRetrying(false);
    }
    onChanged();
  };

  const discard = async () => {
    try {
      await repo.discardPoll(poll.id);
    } catch (e) {
      notify.error(copy.errors.generic);
      throw e; // keeps the confirm open
    }
    notify.success(copy.pollOpening.discarded);
    onChanged();
  };

  // The poll title keeps --text-1 even on a failed row (failedTitle="neutral"); the "Didn't open"
  // pill carries the danger colour.
  const title = poll.title;
  const body = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusPill status={failed ? "didnt-open" : "draft"} />
      <span>
        {failed ? (closingPassed ? copy.pollOpening.closingPassed : copy.pollOpening.didntOpenMeta) : copy.pollOpening.openingMeta}
      </span>
    </span>
  );

  if (!failed) return <StatusRow state="running" title={title} body={body} />;

  return (
    <>
      <StatusRow
        state="failed"
        failedTitle="neutral"
        title={title}
        body={body}
        action={
          !closingPassed && (
            <Button variant="secondary" block={false} onClick={retry} loading={retrying} loadingLabel={copy.pollOpening.retrying}>
              {copy.pollOpening.retry}
            </Button>
          )
        }
        trailing={
          <OverflowMenu
            label={copy.pollOpening.options(poll.title)}
            items={[{ label: copy.pollOpening.discard, onSelect: () => setDiscardOpen(true), destructive: true }]}
          />
        }
      />
      <ConfirmSheet
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={copy.pollOpening.discardTitle}
        body={copy.pollOpening.discardBody}
        confirmLabel={copy.pollOpening.discardConfirm}
        busyLabel={copy.pollOpening.discarding}
        destructive
        onConfirm={discard}
      />
    </>
  );
}

/**
 * P3 "Leave group" (members only). Off-chain like removal (D5): their leaf stays, answers stay
 * counted and anonymous, so the copy promises nothing more. Rejoining needs a new invite.
 */
function LeaveGroupSheet({ group, open, onOpenChange }: { group: Group; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { refreshGroups } = useShell();

  const leave = async () => {
    try {
      await repo.leaveGroup(group.id);
    } catch (e) {
      notify.error(copy.leaveGroup.failed);
      throw e; // keeps the confirm open
    }
    notify.success(copy.leaveGroup.left(group.name));
    forgetLastGroup(group.id);
    refreshGroups();
    router.replace("/");
  };

  return (
    <ConfirmSheet
      open={open}
      onOpenChange={onOpenChange}
      title={copy.leaveGroup.title(group.name)}
      body={copy.leaveGroup.body}
      confirmLabel={copy.leaveGroup.confirm}
      busyLabel={copy.leaveGroup.leaving}
      destructive
      onConfirm={leave}
    />
  );
}
