import type { Metadata } from "next";
import { JoinFlow } from "./_components/join-flow";

export const metadata: Metadata = {
  title: "Join",
  // Invite tokens are capabilities; keep them out of search indexes.
  robots: { index: false, follow: false },
};

/** L2 — join a group from an invite link. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinFlow token={token} />;
}
