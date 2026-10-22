import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Illustration, type IllustrationName } from "./illustration";

export interface PageHeaderProps {
  /** Optional hero illustration (one per screen, ≥ 48 px). */
  illustration?: IllustrationName;
  illustrationSize?: number;
  /** Alt for the illustration; decorative by default. */
  illustrationAlt?: string;
  title: ReactNode;
  description?: ReactNode;
  /** h1 when the AppBar has no title (e.g. home); h2 otherwise. */
  level?: 1 | 2;
  /** `display` size (L6 question / L7 headline) instead of `title`. */
  display?: boolean;
  className?: string;
  id?: string;
}

/** In-content screen heading with optional hero illustration. */
export function PageHeader({
  illustration,
  illustrationSize = 64,
  illustrationAlt,
  title,
  description,
  level = 2,
  display,
  className,
  id,
}: PageHeaderProps) {
  const H = level === 1 ? "h1" : "h2";
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {illustration && <Illustration name={illustration} size={illustrationSize} alt={illustrationAlt} />}
      <H id={id} className={cn(display ? "text-display" : "text-title", "text-text-1")}>
        {title}
      </H>
      {description && <p className="text-body text-text-2">{description}</p>}
    </div>
  );
}
