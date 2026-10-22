"use client";

import { UserMinus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  AnonymityBanner,
  AppBar,
  Button,
  ConfirmSheet,
  Icon,
  MemberCountBlock,
  OverflowMenu,
  PinnedFooter,
  Screen,
  Section,
  SkeletonList,
  TextField,
  notify,
} from "@/components";
import { copy } from "@/lib/copy";
import { repo, type Group, type Member } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";
import { formatDate } from "@/lib/format";
import { InviteSheet } from "../../_components/invite-sheet";
import { AdminOnly, GroupError, GroupLoading, GroupNotFound } from "../../_components/states";

/** Rosters longer than this get a name filter. */
const FILTER_THRESHOLD = 12;

/** L4 — admin-only roster: names + joined dates in a plain list, no avatars. */
export function MembersScreen({ groupId }: { groupId: string }) {
  const group = useQuery(() => repo.getGroup(groupId), [groupId]);
  const admin = group.status === "success" && group.data?.role === "admin" ? group.data : null;

  return (
    <>
      <AppBar title={copy.roster.title} backHref={`/g/${encodeURIComponent(groupId)}`} />
      <Screen withFooter={admin !== null}>
        {group.status === "loading" ? (
          <GroupLoading />
        ) : group.status === "error" ? (
          <GroupError error={group.error} groupId={groupId} onRetry={group.reload} />
        ) : !group.data ? (
          <GroupNotFound />
        ) : group.data.role !== "admin" ? (
          <AdminOnly groupId={groupId} />
        ) : (
          <Roster group={group.data} onChanged={group.reload} />
        )}
      </Screen>
      {admin && (
        <PinnedFooter>
          <InviteSheet
            groupId={groupId}
            groupName={admin.name}
            trigger={
              <Button>
                <Icon icon="invite" />
                {copy.roster.inviteCta}
              </Button>
            }
          />
        </PinnedFooter>
      )}
    </>
  );
}

function Roster({ group, onChanged }: { group: Group; onChanged: () => void }) {
  const members = useQuery(() => repo.getMembers(group.id), [group.id]);
  const [filter, setFilter] = useState("");
  // Target outlives `confirmOpen` so the sheet title doesn't blank out during its close animation.
  const [target, setTarget] = useState<Member | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const visible = useMemo(() => {
    if (members.status !== "success") return [];
    const q = filter.trim().toLocaleLowerCase("en-PH");
    return q ? members.data.filter((m) => m.displayName.toLocaleLowerCase("en-PH").includes(q)) : members.data;
  }, [members.status, members.data, filter]);

  const remove = async () => {
    const removing = target;
    if (!removing) return;
    try {
      // D5 (MVP): removal is OFF-CHAIN only — the member row is deactivated, their invites and
      // reminders stop, and they're left out of polls opened from now on. On-chain leaf removal
      // needs the member's commitment, which only the member knows, so it waits for a later
      // "member leaves / re-key group" feature. Polls already open keep their frozen member set.
      // TODO(M0): decide how "left out of future polls" is enforced before re-keying exists
      // (the on-chain group root still contains their leaf).
      await repo.removeMember(group.id, removing.id);
    } catch (e) {
      notify.error(copy.roster.removeFailed);
      throw e; // keeps the confirm sheet open
    }
    notify.success(copy.members.removed(removing.displayName));
    members.reload();
    onChanged();
  };

  return (
    <>
      <section className="flex flex-col gap-3">
        <MemberCountBlock count={group.memberCount} caption={group.name} />
        <AnonymityBanner>{copy.members.rosterNote}</AnonymityBanner>
      </section>

      <Section title={copy.roster.listLabel}>
        {members.status === "loading" ? (
          <SkeletonList count={5} />
        ) : members.status === "error" ? (
          <GroupError error={members.error} groupId={group.id} onRetry={members.reload} />
        ) : (
          <>
            {members.data.length > FILTER_THRESHOLD && (
              <TextField
                label={copy.roster.filterLabel}
                placeholder={copy.roster.filterPlaceholder}
                type="search"
                autoComplete="off"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            )}
            {visible.length === 0 ? (
              <p role="status" className="py-3 text-body text-text-2">
                {copy.roster.noMatch}
              </p>
            ) : (
              <ul
                aria-label={copy.roster.listLabel}
                className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-raised"
              >
                {visible.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    onRemove={() => {
                      setTarget(m);
                      setConfirmOpen(true);
                    }}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </Section>

      <ConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={target ? copy.members.removeTitle(target.displayName) : copy.members.remove}
        body={copy.members.removeBody}
        confirmLabel={copy.members.removeConfirm}
        busyLabel={copy.common.loading}
        destructive
        onConfirm={remove}
      />
    </>
  );
}

function MemberRow({ member, onRemove }: { member: Member; onRemove: () => void }) {
  return (
    <li className="flex min-h-14 items-center gap-3 py-2 pr-1 pl-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body text-text-1">{member.displayName}</span>
        <span className="text-caption text-text-2">
          {copy.members.joined(formatDate(member.joinedAt))}
          {member.isAdmin && ` · ${copy.roster.adminTag}`}
        </span>
      </div>
      {!member.isAdmin && (
        <OverflowMenu
          label={copy.roster.options(member.displayName)}
          items={[{ label: copy.members.remove, icon: UserMinus, onSelect: onRemove, destructive: true }]}
        />
      )}
    </li>
  );
}
