import type { Metadata } from "next";
import { GroupHome } from "./_components/group-home";

export const metadata: Metadata = { title: "Group" };

/** L3 — group home. Data is read client-side (mock repo now; Supabase + RLS later). */
export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <GroupHome groupId={groupId} />;
}
