"use client";

import Link from "next/link";
import {
  AppBar,
  Button,
  EmptyState,
  Icon,
  ListRow,
  MemberCountBlock,
  Notice,
  Screen,
  Section,
  SkeletonList,
  StatusPill,
} from "@/components";
import { copy } from "@/lib/copy";
import { repo, type Group, type Poll } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";
import { formatClosing } from "@/lib/format";
import { pollDisplayStatus, type PollDisplayStatus } from "@/lib/poll";
import { GroupSwitcher } from "./group-switcher";
import { InviteSheet } from "./invite-sheet";
import { GroupError, GroupLoading, GroupNotFound } from "./states";

/** L3 — group home, the hub. No back button: screens below it come back here. */
export function GroupHome({ groupId }: { groupId: string }) {
  const group = useQuery(() => repo.getGroup(groupId), [groupId]);

  const title =
    group.status === "success" && group.data ? (
      <GroupSwitcher groupId={groupId} groupName={group.data.name} />
    ) : (
      copy.hub.title
    );

  return (
    <>
      <AppBar title={title} />
      <Screen>
        {group.status === "loading" ? (
          <GroupLoading />
        ) : group.status === "error" ? (
          <GroupError error={group.error} groupId={groupId} onRetry={group.reload} />
        ) : !group.data ? (
          // getGroup resolves null for "not found" and "not a member" alike — one state for both.
          <GroupNotFound />
        ) : (
          <HubBody group={group.data} />
        )}
      </Screen>
    </>
  );
}

function HubBody({ group }: { group: Group }) {
  const isAdmin = group.role === "admin";
  const polls = useQuery(() => repo.listPolls(group.id), [group.id]);

  return (
    <>
      <section aria-label={copy.members.count(group.memberCount)} className="flex flex-col gap-3">
        <MemberCountBlock
          count={group.memberCount}
          caption={isAdmin ? copy.hub.adminCaption : copy.hub.memberCaption(group.createdByName)}
        />
        {group.description && <p className="text-body text-text-2">{group.description}</p>}
      </section>

      {isAdmin && <AdminActions group={group} />}

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
        <PollSections group={group} polls={polls.data} />
      )}

      <Link
        href="/privacy"
        className="self-start py-3 text-label text-text-2 underline-offset-4 hover:text-text-1 hover:underline"
      >
        {copy.common.privacyLink}
      </Link>
    </>
  );
}

/** The admin's second row: Members, New poll, Invite link (equal tiles so all three fit at 360 px). */
function AdminActions({ group }: { group: Group }) {
  const base = `/g/${encodeURIComponent(group.id)}`;
  const tile = "min-h-16 flex-col gap-1 px-2 text-center";
  return (
    <nav aria-label={copy.hub.adminActions}>
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

function PollSections({ group, polls }: { group: Group; polls: Poll[] }) {
  const isAdmin = group.role === "admin";
  // Status is derived with Date.now(); safe here because poll data only arrives client-side.
  const withStatus = polls.map((p) => ({ poll: p, status: pollDisplayStatus(p) }));
  const open = withStatus
    .filter((x) => x.status === "open" || x.status === "closing-soon")
    .sort((a, b) => a.poll.closesAt.localeCompare(b.poll.closesAt));
  const past = withStatus
    .filter((x) => x.status === "closed")
    .sort((a, b) => b.poll.closesAt.localeCompare(a.poll.closesAt));
  const drafts = isAdmin ? withStatus.filter((x) => x.status === "draft") : [];

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
                  <Link href={`/g/${encodeURIComponent(group.id)}/polls/new`}>{copy.hub.newPollCta}</Link>
                </Button>
              )
            }
          />
        ) : (
          <PollList items={open} href={(p) => `/p/${encodeURIComponent(p.id)}`} />
        )}
      </Section>

      {drafts.length > 0 && (
        <Section title={copy.hub.drafts}>
          <ul className="flex flex-col gap-card-gap">
            {drafts.map(({ poll }) => (
              <li key={poll.id}>
                <ListRow title={poll.title} meta={copy.hub.draftMeta} trailing={<StatusPill status="draft" />} />
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

function PollList({ items, href }: { items: { poll: Poll; status: PollDisplayStatus }[]; href: (p: Poll) => string }) {
  return (
    <ul className="flex flex-col gap-card-gap">
      {items.map(({ poll, status }) => (
        <li key={poll.id}>
          <ListRow
            href={href(poll)}
            title={poll.title}
            meta={
              <span className="flex flex-col">
                <span className="flex items-center gap-1.5">
                  <Icon icon="closing" size={14} className="shrink-0" />
                  {formatClosing(poll.closesAt)}
                </span>
                {/* Turnout only — safe to show live; never who answered. */}
                <span className="tabular text-text-3">{copy.results.turnout(poll.votersCount, poll.frozenSize)}</span>
              </span>
            }
            trailing={<StatusPill status={status} />}
          />
        </li>
      ))}
    </ul>
  );
}

