import type { Metadata } from "next";
import { MembersScreen } from "./_components/members-screen";

export const metadata: Metadata = { title: "Members" };

/** L4 — admin roster. */
export default async function MembersPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <MembersScreen groupId={groupId} />;
}
