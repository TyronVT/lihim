"use client";

import Link from "next/link";
import { AppBar, Button, EmptyState, Notice, Screen, ShellHeader, Skeleton, type ScreenWidth } from "@/components";
import { copy } from "@/lib/copy";
import { APP_HOME } from "@/lib/routes";

/**
 * Static placeholder shaped like the question + options, so the layout doesn't jump. At ≥ lg the
 * header band gets placeholder bars too (L6 answers in the 560 `form` column, L7 in `page`).
 */
export function PollLoading({ title, width }: { title?: string; width?: ScreenWidth }) {
  return (
    <>
      <AppBar title={title} backHref="/" />
      <Screen
        width={width}
        header={
          <div aria-hidden className="flex flex-col gap-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        }
      >
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
      <Screen className="pt-10" header={<ShellHeader title={copy.poll.title} />}>
        <EmptyState
          illustration="mark"
          title={copy.errors.notFound}
          body={copy.vote.notFoundBody}
          action={
            <Button icon="groups" asChild variant="secondary">
              <Link href={APP_HOME}>{copy.home.title}</Link>
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
      <Screen header={<ShellHeader title={copy.poll.title} />}>
        <Notice
          tone="danger"
          title={copy.errors.generic}
          action={
            <Button icon="retry" variant="secondary" onClick={onRetry}>
              {copy.common.retry}
            </Button>
          }
        />
      </Screen>
    </>
  );
}
