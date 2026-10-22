import { FocusedShell } from "@/components";

/**
 * Public or pre-account screens: L0 /signin, L2 /join/[token], L9 /verify/[pollId]
 * (lihim-UIUX-SPEC.md §4). No sidebar — nothing suggests the visitor is inside someone's account.
 * Never gated: L9 must work with no session and no cookies.
 */
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <FocusedShell>{children}</FocusedShell>;
}
