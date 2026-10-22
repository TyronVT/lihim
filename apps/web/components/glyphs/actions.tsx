import { createGlyph } from "./glyph";

// Lihim line icons, actions group. Inventory and drawing rules: design/ICONS.md.

// Slot line above; the slip (gap at upper right) carries an up arrow into it.
export const Send = createGlyph(
  "send",
  <>
    <path d="M4 3.5H20" />
    <path d="M15 8A3 3 0 0 1 18 11V18A3 3 0 0 1 15 21H9A3 3 0 0 1 6 18V11A3 3 0 0 1 9 8H11.5" />
    <path d="M12 17.5V11.5M9 14.5L12 11.5L15 14.5" />
  </>,
);
export const NewPoll = createGlyph(
  "newPoll",
  <>
    <path d="M16 12V18A3 3 0 0 1 13 21H7A3 3 0 0 1 4 18V11A3 3 0 0 1 7 8H12" />
    <path d="M7.5 14.5L9.5 16.5L12.5 13" />
    <path d="M18 3V9M15 6H21" />
  </>,
);
// Ballot box with its lid lifted; the slot is the gap in the rim.
export const OpenPoll = createGlyph(
  "openPoll",
  <>
    <path d="M9 11H3.5V18A3 3 0 0 0 6.5 21H17.5A3 3 0 0 0 20.5 18V11H15" />
    <path d="M4 7L19 3" />
  </>,
);
export const Retry = createGlyph(
  "retry",
  <>
    <path d="M20 12A8 8 0 1 1 17.5 6.5" />
    <path d="M13.5 6.5H17.5V2.5" />
  </>,
);
export const Share = createGlyph(
  "share",
  <>
    <path d="M9 8A3 3 0 0 0 6 11V18A3 3 0 0 0 9 21H15A3 3 0 0 0 18 18V11A3 3 0 0 0 15 8" />
    <path d="M12 15V2M9 5L12 2L15 5" />
  </>,
);
export const LinkOff = createGlyph(
  "linkOff",
  <>
    <path d="M5.5 9.5L2.5 12.5A4.25 4.25 0 0 0 8.5 18.5L11.5 15.5" />
    <path d="M18.5 14.5L21.5 11.5A4.25 4.25 0 0 0 15.5 5.5L12.5 8.5" />
    <path d="M10.5 10.5L13.5 13.5" />
  </>,
);
export const RemoveMember = createGlyph(
  "removeMember",
  <>
    <path d="M12.5 14C13.5 13.5 14.5 12.5 14.5 11C14.5 7.5 11.5 4.5 9 3C6.5 4.5 3.5 7.5 3.5 11C3.5 12.5 4.5 13.5 5.5 14C3 15 1.5 16.5 1.5 18.5C1.5 20 5 20.5 9 20.5C11 20.5 12.5 20.4 13.5 20" />
    <path d="M6.5 10.5C7.5 10 10.5 10 11.5 10.5L9 13Z" />
    <path d="M16 17.5H22" />
  </>,
);
// Same hood and badge slot as removeMember; the badge is an arrow walking out.
export const Leave = createGlyph(
  "leave",
  <>
    <path d="M12.5 14C13.5 13.5 14.5 12.5 14.5 11C14.5 7.5 11.5 4.5 9 3C6.5 4.5 3.5 7.5 3.5 11C3.5 12.5 4.5 13.5 5.5 14C3 15 1.5 16.5 1.5 18.5C1.5 20 5 20.5 9 20.5C11 20.5 12.5 20.4 13.5 20" />
    <path d="M6.5 10.5C7.5 10 10.5 10 11.5 10.5L9 13Z" />
    <path d="M16 17.5H22M19 14.5L22 17.5L19 20.5" />
  </>,
);
export const Results = createGlyph(
  "results",
  <>
    <path d="M4 3.5V20.5" />
    <path d="M8 7H14" />
    <path d="M8 12H20" />
    <path d="M8 17H11" />
  </>,
);
export const External = createGlyph(
  "external",
  <>
    <path d="M16 13V18A3 3 0 0 1 13 21H7A3 3 0 0 1 4 18V11A3 3 0 0 1 7 8H11" />
    <path d="M10.5 13.5L19.5 4.5M15.5 4.5H19.5V8.5" />
  </>,
);
