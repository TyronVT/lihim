"use client";

import Link from "next/link";
import { Button, EmptyState, Notice, Skeleton, SkeletonList } from "@/components";
import { copy } from "@/lib/copy";
import { ForbiddenError, NotFoundError } from "@/lib/data";

/** Static placeholder for a group screen while the first read is in flight. */
export function GroupLoading() {
  return (
    <div className="flex flex-col gap-section">
      <div className="flex items-center gap-4" aria-hidden>
        <Skeleton className="size-16" />
        <Skeleton className="h-9 w-40" />
      </div>
      <SkeletonList count={3} />
    </div>
  );
}

/** Group missing, or the viewer isn't in it. No hint about which (membership is private). */
export function GroupNotFound() {
  return (
    <EmptyState
      illustration="mark"
      title={copy.hub.notFoundTitle}
      body={copy.hub.notFoundBody}
      action={
        <Button asChild variant="secondary">
          <Link href="/">{copy.hub.home}</Link>
        </Button>
      }
    />
  );
}

/** Shown on admin-only screens (L4, L5) to regular members. */
export function AdminOnly({ groupId }: { groupId: string }) {
  return (
    <Notice
      tone="info"
      icon="anonymous"
      title={copy.errors.adminOnly}
      action={
        <Button asChild variant="secondary">
          <Link href={`/g/${encodeURIComponent(groupId)}`}>{copy.common.back}</Link>
        </Button>
      }
    />
  );
}

/** Branches a failed read into the right state. */
export function GroupError({ error, groupId, onRetry }: { error: unknown; groupId: string; onRetry: () => void }) {
  if (error instanceof NotFoundError) return <GroupNotFound />;
  if (error instanceof ForbiddenError) return <AdminOnly groupId={groupId} />;
  return (
    <Notice
      tone="danger"
      title={copy.errors.generic}
      action={
        <Button variant="secondary" onClick={onRetry}>
          {copy.common.retry}
        </Button>
      }
    />
  );
}
