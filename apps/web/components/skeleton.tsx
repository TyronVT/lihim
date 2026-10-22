import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";

/** Static placeholder block (no shimmer — motion stays calm). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-lg bg-surface", className)} />;
}

/** `count` card-height placeholders with a screen-reader "Loading…". */
export function SkeletonList({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div role="status" className={cn("flex flex-col gap-card-gap", className)}>
      <span className="sr-only">{copy.common.loading}</span>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}
