import { createGlyph } from "./glyph";

// Lihim line icons, account group. Inventory and drawing rules: design/ICONS.md.

// Bow: an outer ring (gap at 2 o'clock) around a fingerprint arc; shaft with one tooth.
export const Passkey = createGlyph(
  "passkey",
  <>
    <path d="M11.5 9A5 5 0 1 0 12.5 12H21.5" />
    <path d="M6.5 14A2.5 2.5 0 1 1 10 12" />
    <path d="M18.5 12V15.5" />
  </>,
);
export const CreateAccount = createGlyph(
  "createAccount",
  <>
    <path d="M12.5 14C13.5 13.5 14.5 12.5 14.5 11C14.5 7.5 11.5 4.5 9 3C6.5 4.5 3.5 7.5 3.5 11C3.5 12.5 4.5 13.5 5.5 14C3 15 1.5 16.5 1.5 18.5C1.5 20 5 20.5 9 20.5C11 20.5 12.5 20.4 13.5 20" />
    <path d="M6.5 10.5C7.5 10 10.5 10 11.5 10.5L9 13Z" />
    <path d="M19 14.5V20.5M16 17.5H22" />
  </>,
);
export const SignOut = createGlyph(
  "signOut",
  <>
    <path d="M14 9V7A3 3 0 0 0 11 4H6A3 3 0 0 0 3 7V17A3 3 0 0 0 6 20H11A3 3 0 0 0 14 17V15" />
    <path d="M8.5 12H20.5" />
    <path d="M17.5 9L20.5 12L17.5 15" />
  </>,
);
export const Settings = createGlyph(
  "settings",
  <>
    <path d="M16.5 7.5L19 6A9 9 0 0 1 20.5 9L18.5 10.5A6.5 6.5 0 0 1 18.5 13.5L20.5 15A9 9 0 0 1 19 18L16.5 16.5A6.5 6.5 0 0 1 13.5 18.5L13.5 21A9 9 0 0 1 10.5 21L10.5 18.5A6.5 6.5 0 0 1 7.5 16.5L5 18A9 9 0 0 1 3.5 15L5.5 13.5A6.5 6.5 0 0 1 5.5 10.5L3.5 9A9 9 0 0 1 5 6L7.5 7.5A6.5 6.5 0 0 1 10.5 5.5L10.5 3A9 9 0 0 1 13.5 3L13.5 5.5" />
    <circle cx="12" cy="12" r="2.5" />
  </>,
);
export const Alerts = createGlyph(
  "alerts",
  <>
    <path d="M14 4.5A6 6 0 0 0 6 10V12.5C6 14.5 5.5 16 4 17.5H20C18.5 16 18 14.5 18 12.5V10A6 6 0 0 0 17 6.5" />
    <path d="M10 20.5A2.5 2.5 0 0 0 14 20.5" />
  </>,
);
export const Groups = createGlyph(
  "groups",
  <>
    <rect x="3" y="9" width="12" height="12" rx="3" />
    <path d="M6 9A3 3 0 0 1 9 6H15A3 3 0 0 1 18 9V15A3 3 0 0 1 15 18" />
    <path d="M9 6A3 3 0 0 1 12 3H18A3 3 0 0 1 21 6V12A3 3 0 0 1 18 15" />
  </>,
);
export const CreateGroup = createGlyph(
  "createGroup",
  <>
    <path d="M12.5 14C13.5 13.5 14.5 12.5 14.5 11C14.5 7.5 11.5 4.5 9 3C6.5 4.5 3.5 7.5 3.5 11C3.5 12.5 4.5 13.5 5.5 14C3 15 1.5 16.5 1.5 18.5C1.5 20 5 20.5 9 20.5C11 20.5 12.5 20.4 13.5 20" />
    <path d="M6.5 10.5C7.5 10 10.5 10 11.5 10.5L9 13Z" />
    <path d="M13.5 4.5C14 4 15 3.5 15.5 3C18 4.5 21 7.5 21 11" />
    <path d="M19 14.5V20.5M16 17.5H22" />
  </>,
);
export const Join = createGlyph(
  "join",
  <>
    <path d="M10 9V7A3 3 0 0 1 13 4H18A3 3 0 0 1 21 7V17A3 3 0 0 1 18 20H13A3 3 0 0 1 10 17V15" />
    <path d="M3.5 12H15.5" />
    <path d="M12.5 9L15.5 12L12.5 15" />
  </>,
);
