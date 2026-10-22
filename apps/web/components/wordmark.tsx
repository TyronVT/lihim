import Image from "next/image";
import { cn } from "@/lib/cn";
import { Illustration } from "./illustration";

export interface WordmarkProps {
  /** Cap-height driver: font-size in px. Default 22. */
  size?: number;
  className?: string;
}

/** "Lihim" — Geist 600, −1.5% tracking, --text-1. No logotype tricks. */
export function Wordmark({ size = 22, className }: WordmarkProps) {
  return (
    <span
      className={cn("font-sans font-semibold text-text-1", className)}
      style={{ fontSize: size, lineHeight: 1, letterSpacing: "-0.015em" }}
    >
      Lihim
    </span>
  );
}

export interface LockupProps {
  /** Mark height in px. ≥ 48 uses the full illustration; smaller uses the flat Glyph. Default 40. */
  markSize?: number;
  /** Show the tagline under the wordmark. */
  tagline?: string;
  className?: string;
}

/**
 * Mark (or Glyph) + wordmark. Gap = 0.4 × mark height; wordmark cap height ≈ 40 % of
 * the mark (Geist cap height ≈ 0.7 em → font-size ≈ 0.57 × mark).
 */
export function Lockup({ markSize = 40, tagline, className }: LockupProps) {
  const fontSize = Math.round(markSize * 0.57);
  return (
    <div className={cn("flex items-center", className)} style={{ gap: Math.round(markSize * 0.4) }}>
      {markSize >= 48 ? (
        <Illustration name="mark" size={markSize} />
      ) : (
        <Image src="/icon.svg" alt="" width={markSize} height={markSize} unoptimized className="rounded-sm" />
      )}
      <div className="flex flex-col gap-1">
        <Wordmark size={fontSize} />
        {tagline && <span className="text-caption text-text-2">{tagline}</span>}
      </div>
    </div>
  );
}
