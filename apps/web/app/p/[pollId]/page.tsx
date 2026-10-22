import type { Metadata } from "next";
import { VoteScreen } from "./_components/vote-screen";

// Poll titles stay out of metadata: link previews in group chats would leak the question.
export const metadata: Metadata = { title: "Poll", robots: { index: false } };

export default async function VotePage({ params }: { params: Promise<{ pollId: string }> }) {
  const { pollId } = await params;
  return <VoteScreen pollId={pollId} />;
}
