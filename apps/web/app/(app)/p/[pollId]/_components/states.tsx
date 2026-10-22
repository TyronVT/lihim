"use client";

import Link from "next/link";
import { AppBar, Button, EmptyState, Notice, Screen, Skeleton } from "@/components";
import { copy } from "@/lib/copy";

/** Static placeholder shaped like the question + options, so the layout doesn't jump. */
export function PollLoading({ title }: { title?: string }) {
  return (
    <>
      <AppBar title={title} backHref="/" />
      <Screen>
        <div role="status" className="flex flex-col gap-3">
          <span className="sr-only">{copy.common.loading}</span>
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-16" />
        </div>
        <div aria-hidden className="flex flex-col gap-3">
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-14 rounded-md" />
          <Skeleton className="h-14 rounded-md" />
        </div>
      </Screen>
    </>
  );
}

/** Not found or not a member — deliberately the same message so it doesn't confirm membership. */
export function PollNotFound() {
  return (
    <>
      <AppBar backHref="/" />
      <Screen className="pt-10">
        <EmptyState
          illustration="mark"
          title={copy.errors.notFound}
          body={copy.vote.notFoundBody}
          action={
            <Button asChild variant="secondary">
              <Link href="/">{copy.home.title}</Link>
            </Button>
          }
        />
      </Screen>
    </>
  );
}

export function PollLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <AppBar backHref="/" />
      <Screen>
        <Notice
          tone="danger"
          title={copy.errors.generic}
          action={
            <Button variant="secondary" onClick={onRetry}>
              {copy.common.retry}
            </Button>
          }
        />
      </Screen>
    </>
  );
}
