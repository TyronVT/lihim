"use client";

import { AppBar, Screen } from "@/components";
import { copy } from "@/lib/copy";
import { repo } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";
import { AdminOnly, GroupError, GroupLoading, GroupNotFound } from "../../../_components/states";
import { PollForm } from "./poll-form";

/** L5 — create poll. Admin only; blocked below the group's min_members. */
export function NewPollScreen({ groupId }: { groupId: string }) {
  const group = useQuery(() => repo.getGroup(groupId), [groupId]);
  const backHref = `/g/${encodeURIComponent(groupId)}`;

  if (group.status === "success" && group.data?.role === "admin") {
    // PollForm owns the screen below the app bar, including the pinned footer.
    return <PollForm group={group.data} backHref={backHref} />;
  }

  return (
    <>
      <AppBar title={copy.newPoll.title} backHref={backHref} />
      <Screen>
        {group.status === "loading" ? (
          <GroupLoading />
        ) : group.status === "error" ? (
          <GroupError error={group.error} groupId={groupId} onRetry={group.reload} />
        ) : !group.data ? (
          <GroupNotFound />
        ) : (
          <AdminOnly groupId={groupId} />
        )}
      </Screen>
    </>
  );
}
