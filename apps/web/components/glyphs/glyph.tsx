import type { JSX, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/cn";

export interface GlyphProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  /** px. Callers normally go through `Icon`, which sets 20 / 24 / 16. */
  size?: number | string;
}

export type Glyph = ((props: GlyphProps) => JSX.Element) & { displayName?: string };

/**
 * One Lihim line icon: 24 grid, currentColor, round caps and joins, no fill
 * (design/ICONS.md → Drawing rules). `body` is the raw SVG children.
 */
export function createGlyph(name: string, body: ReactNode): Glyph {
  function LihimGlyph({ size = 24, strokeWidth = 1.75, className, ...rest }: GlyphProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-glyph={name}
        className={cn("shrink-0", className)}
        {...rest}
      >
        {body}
      </svg>
    );
  }
  LihimGlyph.displayName = `Glyph(${name})`;
  return LihimGlyph;
}
