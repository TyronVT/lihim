import { createGlyph } from "./glyph";

// Lihim line icons, ui group. Inventory and drawing rules: design/ICONS.md.
// Arrow heads step 3 units each way (arms ≈ 4 at 45°, shared by every arrow in
// the set); chevron arms run 4. Status circles keep the withheld gap at half past one.

export const ArrowLeft = createGlyph(
  "arrowLeft",
  <>
    <path d="M19.5 12h-15" />
    <path d="M7.5 9l-3 3 3 3" />
  </>,
);
export const ArrowRight = createGlyph(
  "arrowRight",
  <>
    <path d="M4.5 12h15" />
    <path d="M16.5 9l3 3-3 3" />
  </>,
);
export const ArrowUp = createGlyph(
  "arrowUp",
  <>
    <path d="M12 19.5v-15" />
    <path d="M9 7.5l3-3 3 3" />
  </>,
);
export const ArrowDown = createGlyph(
  "arrowDown",
  <>
    <path d="M12 4.5v15" />
    <path d="M9 16.5l3 3 3-3" />
  </>,
);
export const ChevronRight = createGlyph("chevronRight", <path d="M10 8l4 4-4 4" />);
export const ChevronDown = createGlyph("chevronDown", <path d="M8 10l4 4 4-4" />);
export const ChevronsUpDown = createGlyph(
  "chevronsUpDown",
  <>
    <path d="M8 9.5l4-4 4 4" />
    <path d="M8 14.5l4 4 4-4" />
  </>,
);
export const Plus = createGlyph(
  "plus",
  <>
    <path d="M12 5.5v13" />
    <path d="M5.5 12h13" />
  </>,
);
export const Minus = createGlyph("minus", <path d="M5.5 12h13" />);
export const Close = createGlyph(
  "close",
  <>
    <path d="M7 7l10 10" />
    <path d="M17 7L7 17" />
  </>,
);
// Short arm 4.5, long arm 9.5: the tick leans right of centre, like a mark on a slip.
export const Check = createGlyph("check", <path d="M5 12.5l4.5 4.5L19 7.5" />);
export const Success = createGlyph(
  "success",
  <>
    <path d="M19.5 7A9 9 0 1 1 17 4.5" />
    <path d="M8.5 12l2.5 2.5 4.5-5" />
  </>,
);
export const Alert = createGlyph(
  "alert",
  <>
    <path d="M19.5 7A9 9 0 1 1 17 4.5" />
    <path d="M12 7.5v5" />
    <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
  </>,
);
export const Info = createGlyph(
  "info",
  <>
    <path d="M19.5 7A9 9 0 1 1 17 4.5" />
    <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
    <path d="M12 11v5" />
  </>,
);
export const More = createGlyph(
  "more",
  <>
    <circle cx="6" cy="12" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.25" fill="currentColor" stroke="none" />
  </>,
);
