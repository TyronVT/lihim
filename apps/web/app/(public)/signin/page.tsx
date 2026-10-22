import type { Metadata } from "next";
import { SignInScreen } from "./_components/sign-in-screen";

export const metadata: Metadata = { title: "Sign in" };

/** L0 — Sign in (P1, P5). Public; FocusedShell from app/(public)/layout.tsx. */
export default function SignInPage() {
  return <SignInScreen />;
}
