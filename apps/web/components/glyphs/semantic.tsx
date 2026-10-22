import { createGlyph } from "./glyph";

// Lihim line icons, semantic group. Inventory and drawing rules: design/ICONS.md.

// Almond eye split by the slash; only the pupil's upper-right quarter shows.
export const Anonymous = createGlyph("anonymous", <>
  <path d="M9.2 5.5C10.1 5.2 11.1 5 12 5C15.5 5 19 7.5 21.5 12C20.8 13.3 20 14.5 19.1 15.4" />
  <path d="M14.8 18.5C13.9 18.8 12.9 19 12 19C8.5 19 5 16.5 2.5 12C3.2 10.7 4 9.5 4.9 8.6" />
  <path d="M12 8.5A3.5 3.5 0 0 1 15.5 12" />
  <path d="M4 4L20 20" />
</>);
// Front hood (outline + V face), second hood's edge behind at the upper right.
export const Members = createGlyph("members", <>
  <path d="M9 3C11.5 4.5 14.5 7.5 14.5 11C14.5 12.5 13.5 13.5 12.5 14C15 15 16.5 16.5 16.5 18.5C16.5 20 13 20.5 9 20.5C5 20.5 1.5 20 1.5 18.5C1.5 16.5 3 15 5.5 14C4.5 13.5 3.5 12.5 3.5 11C3.5 7.5 6.5 4.5 9 3Z" />
  <path d="M6.5 10.5C7.5 10 10.5 10 11.5 10.5L9 13Z" />
  <path d="M13.5 4.5C14 4 15 3.5 15.5 3C18 4.5 21 7.5 21 11C21 12.5 20.5 13.5 19.5 14C21 14.5 22.5 16 22.5 18" />
</>);
export const Verified = createGlyph("verified", <>
  <path d="M17 4.3L18.8 5Q19.5 5.3 19.5 6V11C19.5 16 15.5 19.5 12 21C8.5 19.5 4.5 16 4.5 11V6Q4.5 5.3 5.2 5L11.3 2.8Q12 2.5 12.7 2.8L13.5 3.1" />
  <path d="M8.5 12L11 14.5L15.5 9.5" />
</>);
// Slip tilted 10° and cut off at the slot line, as if half posted.
export const Poll = createGlyph("poll", <>
  <path d="M6 19L8 7.3A3 3 0 0 1 11.5 4.9L15.5 5.6A3 3 0 0 1 17.9 9L16.2 19" />
  <path d="M9.8 11.2L11.5 13.5L15 10.6" />
  <path d="M3 19H21" />
</>);
export const Closing = createGlyph("closing", <>
  <path d="M19.5 7A9 9 0 1 1 17 4.5" />
  <path d="M12 7.5V12L15.5 10" />
</>);
export const Warning = createGlyph("warning", <>
  <path d="M15 8.5L21 17.5Q22 19 20 19H4Q2 19 3 17.5L11 5.5Q12 4 13 5.5" />
  <path d="M12 10V13.5" />
  <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
</>);
// Back slip stops mid-corner on both ends, well clear of the front slip.
export const Copy = createGlyph("copy", <>
  <rect x="9" y="8" width="11" height="13" rx="3" />
  <path d="M4.9 15.1A3 3 0 0 1 4 13V6A3 3 0 0 1 7 3H12A3 3 0 0 1 14.1 3.9" />
</>);
export const Verify = createGlyph("verify", <>
  <path d="M16.5 7A7 7 0 1 1 14 4.5" />
  <path d="M15.5 15.5L21 21" />
  <path d="M7.5 10.5L9.5 12.5L13.5 8.5" />
</>);
// Two U hooks on the diagonal, mouths facing, each one's inner arm inside the other.
// Arms sit r·(1,1) = (3,3) apart so every end lands on the grid; linkOff reuses them.
export const Invite = createGlyph("invite", <>
  <path d="M8.5 6.5L4.5 10.5A4.25 4.25 0 0 0 10.5 16.5L15 12" />
  <path d="M15.5 17.5L19.5 13.5A4.25 4.25 0 0 0 13.5 7.5L9 12" />
</>);
