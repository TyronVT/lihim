import type { Metadata } from "next";
import { copy } from "@/lib/copy";
import { VerifyScreen } from "./_components/verify-screen";

// Public, no login (product rule: anyone can recount). Titles stay generic in metadata.
export const metadata: Metadata = { title: copy.verify.title, description: copy.verify.footer };

export default async function VerifyPage({ params }: { params: Promise<{ pollId: string }> }) {
  const { pollId } = await params;
  return <VerifyScreen pollId={pollId} />;
}
