"use client";

import Link from "next/link";
import { Button, EmptyState, ListRow, Notice, Section, SkeletonList } from "@/components";
import { copy } from "@/lib/copy";
import { repo } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";

/** Home: the viewer's groups (switcher) or the Mark empty state. */
export function GroupList() {
  const groups = useQuery(() => repo.listMyGroups(), []);

  if (groups.status === "loading") return <SkeletonList count={3} />;
  if (groups.status === "error")
    return (
      <Notice
        tone="danger"
        title={copy.errors.generic}
        action={
          <Button variant="secondary" onClick={groups.reload}>
            {copy.common.retry}
          </Button>
        }
      />
    );

  if (groups.data.length === 0)
    return <EmptyState illustration="mark" title={copy.home.emptyTitle} body={copy.home.emptyBody} />;

  return (
    <Section title={copy.home.title} aria-label={copy.home.switcherLabel}>
      <ul className="flex flex-col gap-card-gap">
        {groups.data.map((g) => (
          <li key={g.id}>
            <ListRow
              href={`/g/${g.id}`}
              title={g.name}
              meta={
                <span className="tabular">
                  {copy.members.count(g.memberCount)}
                  {g.openPollsCount > 0 && ` · ${copy.group.openPollsCount(g.openPollsCount)}`}
                  {g.role === "admin" && ` · ${copy.group.adminTag}`}
                </span>
              }
            />
          </li>
        ))}
      </ul>
      <Link href="/privacy" className="self-start py-3 text-label text-text-2 underline-offset-4 hover:text-text-1 hover:underline">
        {copy.common.privacyLink}
      </Link>
    </Section>
  );
}
