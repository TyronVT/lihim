"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, EmptyState, Notice, SkeletonList } from "@/components";
import { copy } from "@/lib/copy";
import { repo } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";
import { lastGroupId } from "@/lib/last-group";
import { MEDIA, useMediaQuery } from "@/lib/media";

/**
 * /groups at ≥ lg (lihim-UIUX-SPEC.md §3): the sidebar replaces Home's list, so open the
 * last-visited group (else the first one); with no groups, show the empty state here.
 * Renders nothing below lg, where Home stays the group list.
 */
export function DesktopHome() {
  const desktop = useMediaQuery(MEDIA.lg);
  const router = useRouter();
  const groups = useQuery(() => (desktop ? repo.listMyGroups() : Promise.resolve(null)), [desktop]);
  const list = groups.status === "success" ? groups.data : null;

  useEffect(() => {
    if (!list || list.length === 0) return;
    const last = lastGroupId();
    const target = list.find((g) => g.id === last) ?? list[0]!;
    router.replace(`/g/${encodeURIComponent(target.id)}`);
  }, [list, router]);

  if (!desktop) return null;
  return (
    <div className="hidden lg:flex lg:flex-col">
      {groups.status === "error" ? (
        <Notice
          tone="danger"
          title={copy.errors.generic}
          action={
            <Button icon="retry" variant="secondary" onClick={groups.reload}>
              {copy.common.retry}
            </Button>
          }
        />
      ) : list && list.length === 0 ? (
        <EmptyState
          illustration="group"
          title={copy.home.emptyTitle}
          body={copy.home.emptyBody}
          action={
            <Button icon="createGroup" asChild>
              <Link href="/groups/new">{copy.group.create}</Link>
            </Button>
          }
        />
      ) : (
        <SkeletonList count={3} />
      )}
    </div>
  );
}
