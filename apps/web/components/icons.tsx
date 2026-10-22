import {
  Clock,
  Copy,
  EyeOff,
  Link as LinkIcon,
  SearchCheck,
  ShieldCheck,
  TriangleAlert,
  Users,
  Vote,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

/**
 * Fixed concept → Lucide icon mapping (lihim-DESIGN.md → Iconography) so meaning never
 * drifts between screens. Never use a lock to mean "anonymous": a lock promises
 * encrypted content, which is a different claim.
 */
export const Icons = {
  anonymous: EyeOff,
  members: Users,
  verified: ShieldCheck,
  poll: Vote,
  closing: Clock,
  warning: TriangleAlert,
  copy: Copy,
  verify: SearchCheck,
  invite: LinkIcon,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof Icons;

export const ICON_STROKE = 1.75;
export const ICON_SIZE = 20;
export const APP_BAR_ICON_SIZE = 24;

export interface IconProps extends Omit<LucideProps, "ref"> {
  /** A concept from `Icons`, or any Lucide component for one-off UI glyphs (chevrons, plus…). */
  icon: IconName | LucideIcon;
  /** px. 20 default, 24 in the app bar. */
  size?: number;
  /** Accessible label. Omit for decorative icons (the default: aria-hidden). */
  label?: string;
}

/** Lucide icon with Lihim defaults: 1.75 stroke, 20 px, currentColor, decorative unless labelled. */
export function Icon({ icon, size = ICON_SIZE, label, strokeWidth = ICON_STROKE, ...rest }: IconProps) {
  const Cmp = typeof icon === "string" ? Icons[icon] : icon;
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable={false}
      {...rest}
    />
  );
}
