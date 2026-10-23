"use client";

import { Button, CountBadge, EmptyState, Icon, ListRow, Notice, Section, SkeletonList } from "@/components";
import { copy } from "@/lib/copy";
import { repo, type GroupSummary } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";

/**
 * Home (compact/medium): the viewer's groups (switcher) or the empty state. The screen's
 * primary ("Create group") is Home's PinnedFooter, so the empty state carries no button here.
 */
export function GroupList() {
  const groups = useQuery(() => repo.listMyGroups(), []);

  if (groups.status === "loading") return <SkeletonList count={3} />;
  if (groups.status === "error")
    return (
      <Notice
        tone="danger"
        title={copy.errors.generic}
        action={
          <Button icon="retry" variant="secondary" onClick={groups.reload}>
            {copy.common.retry}
          </Button>
        }
      />
    );

  if (groups.data.length === 0)
    return <EmptyState illustration="group" title={copy.home.emptyTitle} body={copy.home.emptyBody} />;

  return (
    <Section title={copy.home.title} aria-label={copy.home.switcherLabel}>
      <ul className="flex flex-col gap-card-gap">
        {groups.data.map((g) => (
          <li key={g.id}>
            <GroupRow group={g} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * Name; meta "31 members · 2 open polls" with the open-poll count as a small --text-1 badge so it
 * reads at a glance; the "Admin" role chip on the trailing side, before the chevron.
 */
function GroupRow({ group: g }: { group: GroupSummary }) {
  return (
    <ListRow
      href={`/g/${encodeURIComponent(g.id)}`}
      title={g.name}
      meta={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular">
          {copy.members.count(g.memberCount)}
          {g.openPollsCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <CountBadge count={g.openPollsCount} label={copy.shell.openPollsBadge(g.openPollsCount)} words />
            </>
          )}
        </span>
      }
      trailing={
        <span className="flex shrink-0 items-center gap-2">
          {g.role === "admin" && (
            <span className="inline-flex h-6 items-center rounded-full border border-border px-2.5 text-caption font-medium text-text-2">
              {copy.group.adminTag}
            </span>
          )}
          <Icon icon="chevronRight" className="text-text-3" />
        </span>
      }
    />
  );
}
