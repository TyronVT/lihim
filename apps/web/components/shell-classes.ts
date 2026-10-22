/**
 * Breakpoint rules for chrome that only exists on compact/medium. The shells (AppShell,
 * FocusedShell) put `data-shell` on their root; at ≥ lg (1024) inside a shell the sidebar,
 * the focused top bar and the page header (ShellHeader) take over, so these hide themselves.
 * Outside a shell (dev pages, not-found) nothing changes.
 *
 * Plain strings so server components (AppBar, PinnedFooter, Screen) can use them.
 */

/** AppBar, PinnedFooter, FooterLinks: hidden at ≥ lg inside a shell. */
export const HIDE_IN_SHELL_LG = "lg:[[data-shell]_&]:hidden";

/** ShellHeader band (Screen `header`): shown only at ≥ lg inside a shell. */
export const SHOW_IN_SHELL_LG = "hidden lg:[[data-shell]_&]:block";

/** Screen withFooter: the pinned footer is gone at ≥ lg inside a shell, so drop its clearance. */
export const NO_FOOTER_PAD_IN_SHELL_LG = "lg:[[data-shell]_&]:pb-14";

/**
 * Row actions (the `⋯` on L4) that appear on row hover/focus at ≥ lg on hover-capable
 * devices only. Below lg, and on touch, they stay visible (spec §3 "No hover-only actions on
 * touch devices"). Needs a `group/row` ancestor (DataTable rows have it).
 */
export const REVEAL_ON_ROW_HOVER =
  "[@media(hover:hover)_and_(min-width:1024px)]:opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-[state=open]:opacity-100";
