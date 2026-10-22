import type { Metadata } from "next";
import { NewPollScreen } from "./_components/new-poll-screen";

export const metadata: Metadata = { title: "New poll" };

/** L5 — create poll (admin). */
export default async function NewPollPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <NewPollScreen groupId={groupId} />;
}
