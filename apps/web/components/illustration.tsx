import { getImageProps } from "next/image";
import { cn } from "@/lib/cn";

export type IllustrationName = "mark" | "verified" | "poll" | "group";

export interface IllustrationProps {
  /** mark = Lihim (hooded figure) · verified = shield+star · poll = ballot box · group = people ring. */
  name: IllustrationName;
  /** Rendered px (square). Hero illustrations are ≥ 48; use <Icon> below that. Default 96. */
  size?: number;
  /** Decorative by default. Give alt only where it carries meaning (e.g. "Lihim" on L8). */
  alt?: string;
  /** Eager-load + high fetch priority. Only on L2/L6 success states. */
  priority?: boolean;
  /**
   * In light mode, sit on an --ink-950 rounded tile (the art is drawn for dark).
   * Default true; disable only when the parent already provides a dark surface.
   */
  tile?: boolean;
  className?: string;
}

/**
 * Hero illustration from /public/illustrations/{name}@2x|@3x.webp (160 px base art).
 * We hand-write srcSet with the pre-exported 2×/3× files instead of the image optimizer:
 * the files are already sized and compressed.
 */
export function Illustration({ name, size = 96, alt = "", priority, tile = true, className }: IllustrationProps) {
  const src2 = `/illustrations/${name}@2x.webp`;
  const src3 = `/illustrations/${name}@3x.webp`;
  const { props } = getImageProps({
    src: src2,
    alt,
    width: size,
    height: size,
    unoptimized: true,
    priority,
  });
  // In light mode the art shrinks inside an ink-950 tile; the footprint stays `size` in both
  // themes so layouts don't shift on theme change.
  const inner = tile ? `calc(${size}px - ${Math.round(size * 0.24)}px * var(--illustration-tile-on))` : `${size}px`;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg",
        tile && "bg-illustration-tile",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- getImageProps output; alt is in props */}
      <img {...props} srcSet={`${src2} 2x, ${src3} 3x`} style={{ width: inner, height: inner }} />
    </span>
  );
}
