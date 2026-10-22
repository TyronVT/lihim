import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/cn";
import type { Glyph } from "./glyphs";
import { Icon, type IconName } from "./icons";

export const buttonVariants = cva(
  [
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 text-label select-none",
    "transition-[background-color,border-color,color,opacity,transform] duration-fast ease-out",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        /** One per screen. Inverse fill (light on dark). */
        primary: "bg-primary-bg text-primary-fg hover:opacity-90",
        secondary: "border border-border-control bg-transparent text-text-1 hover:bg-surface",
        /** Always behind a ConfirmSheet. */
        destructive: "border border-border-control bg-transparent text-danger hover:bg-surface",
        /** Text-only tertiary action (e.g. "Who can see what"). Still 48 px tall. */
        ghost: "bg-transparent text-text-2 hover:text-text-1",
      },
      block: {
        true: "w-full",
        false: "w-auto",
      },
    },
    defaultVariants: { variant: "primary", block: true },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. next/link <Link>) with button styling. */
  asChild?: boolean;
  /**
   * Busy state: disables the button and swaps the label for `loadingLabel` (words, never a
   * bare spinner).
   */
  loading?: boolean;
  loadingLabel?: string;
  /**
   * Leading icon before the words (design/ICONS.md → Placement rules): one per button, 20 px,
   * decorative. Dropped while the loading label shows.
   */
  icon?: IconName | Glyph;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Button — h-48, radius 12, full width by default (`block={false}` for inline).
 * Variants: primary | secondary | destructive | ghost.
 */
export function Button({
  className,
  variant,
  block,
  asChild,
  loading,
  loadingLabel,
  icon,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const showLoading = Boolean(loading && loadingLabel && !asChild);
  return (
    <Comp
      className={cn(buttonVariants({ variant, block }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
    >
      {icon && !showLoading && <Icon icon={icon} />}
      {/* Slottable: with asChild the icon goes inside the child (e.g. <Link>), before its words. */}
      <Slottable>{showLoading ? loadingLabel : children}</Slottable>
    </Comp>
  );
}
