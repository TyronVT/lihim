"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, Icon, ListRow, Notice, Sheet, SkeletonList } from "@/components";
import { copy } from "@/lib/copy";
import { repo } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";

/**
 * The L3 app-bar title: the current group's name, tappable to switch groups
 * (lihim-DESIGN.md → Layout: "A user in several groups gets a group switcher at the top of L3").
 * Groups are read only when the sheet opens.
 */
export function GroupSwitcher({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={copy.hub.switchTitle}
      trigger={
        <button
          type="button"
          aria-haspopup="dialog"
          className="-ml-2 inline-flex min-h-12 max-w-full items-center gap-1 rounded-md px-2 text-left text-heading text-text-1 transition-colors duration-fast hover:bg-surface"
        >
          <span className="truncate">{groupName}</span>
          <span className="sr-only">, {copy.home.switcherLabel}</span>
          <Icon icon={ChevronDown} className="shrink-0 text-text-2" />
        </button>
      }
      footer={
        <Button asChild variant="secondary">
          <Link href="/groups/new" onClick={() => setOpen(false)}>
            {copy.group.create}
          </Link>
        </Button>
      }
    >
      {open && <SwitcherList currentId={groupId} onPick={() => setOpen(false)} />}
    </Sheet>
  );
}

function SwitcherList({ currentId, onPick }: { currentId: string; onPick: () => void }) {
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

  return (
    <nav aria-label={copy.home.switcherLabel} className="flex flex-col gap-card-gap">
      {/* Closing on click: navigating between /g/a and /g/b can keep this sheet mounted. */}
      <ul className="flex flex-col gap-card-gap" onClickCapture={onPick}>
        {groups.data.map((g) => {
          const current = g.id === currentId;
          return (
            <li key={g.id} aria-current={current ? "page" : undefined}>
              <ListRow
                href={current ? undefined : `/g/${encodeURIComponent(g.id)}`}
                title={g.name}
                meta={
                  <span className="tabular">
                    {copy.members.count(g.memberCount)}
                    {g.role === "admin" && ` · ${copy.group.adminTag}`}
                  </span>
                }
                trailing={current ? <span className="shrink-0 text-caption text-text-3">{copy.hub.current}</span> : undefined}
                className={current ? "border-border-control bg-surface-raised" : undefined}
              />
            </li>
          );
        })}
      </ul>
      <Link
        href="/"
        onClick={onPick}
        className="self-start py-3 text-label text-text-2 underline-offset-4 hover:text-text-1 hover:underline"
      >
        {copy.hub.allGroups}
      </Link>
    </nav>
  );
}
