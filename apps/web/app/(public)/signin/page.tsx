import type { Metadata } from "next";
import { SignInScreen } from "./_components/sign-in-screen";

export const metadata: Metadata = { title: "Sign in" };

/** L0 — Sign in (P1). PLACEHOLDER: the account builder replaces SignInScreen with the full spec. */
export default function SignInPage() {
  return <SignInScreen />;
}
