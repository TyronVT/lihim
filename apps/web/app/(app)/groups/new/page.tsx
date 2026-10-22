import type { Metadata } from "next";
import { CreateGroupScreen } from "./_components/create-group-screen";

export const metadata: Metadata = { title: "Create group" };

/** L1 — create group. */
export default function CreateGroupPage() {
  return <CreateGroupScreen />;
}
