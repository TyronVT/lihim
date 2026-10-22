import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { Illustration } from "./illustration";

export interface MemberCountBlockProps {
  count: number;
  /** Line under the count, e.g. group name or "Only you see names" for admins. */
  caption?: string;
  className?: string;
}

/** Group illustration (64 px) + "31 members" in `display`. No names or avatars, ever. */
export function MemberCountBlock({ count, caption, className }: MemberCountBlockProps) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <Illustration name="group" size={64} />
      <div className="flex flex-col">
        <p className="text-display text-text-1">
          <span className="tabular">{formatCount(count)}</span>{" "}
          <span className="text-title text-text-2">{copy.members.countLabel(count)}</span>
        </p>
        {caption && <p className="text-caption text-text-3">{caption}</p>}
      </div>
    </div>
  );
}
