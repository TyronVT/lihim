import * as G from "./glyphs";
import type { Glyph, GlyphProps } from "./glyphs";

/**
 * Lihim line icons (design/ICONS.md): fixed concept → glyph mapping so meaning never drifts
 * between screens. Never use a lock to mean "anonymous": a lock promises encrypted content,
 * which is a different claim.
 */
export const Icons = {
  anonymous: G.Anonymous,
  members: G.Members,
  verified: G.Verified,
  poll: G.Poll,
  closing: G.Closing,
  warning: G.Warning,
  copy: G.Copy,
  verify: G.Verify,
  invite: G.Invite,
  passkey: G.Passkey,
  createAccount: G.CreateAccount,
  signOut: G.SignOut,
  settings: G.Settings,
  alerts: G.Alerts,
  groups: G.Groups,
  createGroup: G.CreateGroup,
  join: G.Join,
  send: G.Send,
  newPoll: G.NewPoll,
  openPoll: G.OpenPoll,
  retry: G.Retry,
  share: G.Share,
  linkOff: G.LinkOff,
  removeMember: G.RemoveMember,
  leave: G.Leave,
  results: G.Results,
  external: G.External,
  arrowLeft: G.ArrowLeft,
  arrowRight: G.ArrowRight,
  arrowUp: G.ArrowUp,
  arrowDown: G.ArrowDown,
  chevronRight: G.ChevronRight,
  chevronDown: G.ChevronDown,
  chevronsUpDown: G.ChevronsUpDown,
  plus: G.Plus,
  minus: G.Minus,
  close: G.Close,
  check: G.Check,
  success: G.Success,
  alert: G.Alert,
  info: G.Info,
  more: G.More,
} as const satisfies Record<string, Glyph>;

export type IconName = keyof typeof Icons;

export const ICON_STROKE = 1.75;
export const ICON_SIZE = 20;
export const APP_BAR_ICON_SIZE = 24;

export interface IconProps extends GlyphProps {
  /** A name from `Icons`, or a glyph component. */
  icon: IconName | Glyph;
  /** px. 20 default, 24 in the app bar, 16 in chips, 14 in pills. */
  size?: number;
  /** Accessible label. Omit for decorative icons (the default: aria-hidden). */
  label?: string;
}

/** Lihim line icon with defaults: 1.75 stroke, 20 px, currentColor, decorative unless labelled. */
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
