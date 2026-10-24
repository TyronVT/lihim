"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AnonymityBanner,
  AppBar,
  Button,
  ConfirmSheet,
  DataTable,
  HIDE_IN_SHELL_LG,
  Icon,
  MemberCountBlock,
  OverflowMenu,
  PinnedFooter,
  REVEAL_ON_ROW_HOVER,
  SHOW_IN_SHELL_LG,
  Screen,
  Section,
  ShellHeader,
  SkeletonList,
  StatusRow,
  TextField,
  notify,
  type DataTableColumn,
} from "@/components";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";
import { repo, type Group, type Member } from "@/lib/data";
import { useQuery } from "@/lib/data/hooks";
import { formatDate } from "@/lib/format";
import { InviteSheet } from "../../_components/invite-sheet";
import { AdminOnly, GroupError, GroupLoading, GroupNotFound } from "../../_components/states";

const LOCALE = "en-PH";

/** L4 — admin-only roster: names + joined dates, no avatars. Rows on compact, a sortable table at ≥ lg. */
export function MembersScreen({ groupId }: { groupId: string }) {
  const group = useQuery(() => repo.getGroup(groupId), [groupId]);
  const loaded = group.status === "success" ? group.data : null;
  const admin = loaded?.role === "admin" ? loaded : null;
  const backHref = `/g/${encodeURIComponent(groupId)}`;

  // THE primary: in the PinnedFooter on compact/medium, in the ShellHeader at ≥ lg.
  const primary = admin && (
    <InviteSheet
      groupId={groupId}
      groupName={admin.name}
      trigger={
        <Button icon="invite">
          {copy.roster.inviteCta}
        </Button>
      }
    />
  );

  return (
    <>
      <AppBar title={copy.roster.title} backHref={backHref} settings />
      <Screen
        withFooter={admin !== null}
        header={
          <ShellHeader
            back={{ href: backHref, label: loaded?.name ?? copy.common.back }}
            title={copy.roster.title}
            context={admin ? `${copy.members.count(admin.memberCount)} · ${copy.members.rosterNote}` : undefined}
            actions={primary}
          />
        }
      >
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
      {primary && <PinnedFooter>{primary}</PinnedFooter>}
    </>
  );
}

function Roster({ group, onChanged }: { group: Group; onChanged: () => void }) {
  const members = useQuery(() => repo.getMembers(group.id, { includeRemoved: true }), [group.id]);
  const [filter, setFilter] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  // Target outlives `confirmOpen` so the sheet title doesn't blank out during its close animation.
  const [target, setTarget] = useState<Member | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const removedId = useId();

  const reloadMembers = members.reload;
  const onAdded = useCallback(() => {
    reloadMembers();
    onChanged();
  }, [reloadMembers, onChanged]);

  // Spec §3: "/" focuses the member search (not while typing, or while a dialog is open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (!searchRef.current) return;
      e.preventDefault();
      searchRef.current.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { active, removed } = useMemo(() => {
    if (members.status !== "success") return { active: [], removed: [] };
    const q = filter.trim().toLocaleLowerCase(LOCALE);
    const match = (m: Member) => !q || m.displayName.toLocaleLowerCase(LOCALE).includes(q);
    return {
      active: members.data.filter((m) => m.status === "active" && match(m)),
      removed: members.data.filter((m) => m.status === "removed" && match(m)),
    };
  }, [members.status, members.data, filter]);

  const activeTotal = members.status === "success" ? members.data.filter((m) => m.status === "active").length : 0;
  const removedTotal = members.status === "success" ? members.data.length - activeTotal : 0;

  const askRemove = (m: Member) => {
    setTarget(m);
    setConfirmOpen(true);
  };

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
      {/* ≥ lg the ShellHeader's context line carries the count and the note. */}
      <section className={cn("flex flex-col gap-3", HIDE_IN_SHELL_LG)}>
        <MemberCountBlock count={group.memberCount} caption={group.name} />
        <AnonymityBanner>{copy.members.rosterNote}</AnonymityBanner>
      </section>

      <AddingMembers groupId={group.id} onAdded={onAdded} />

      <Section title={copy.roster.listLabel}>
        {members.status === "loading" ? (
          <SkeletonList count={5} />
        ) : members.status === "error" ? (
          <GroupError error={members.error} groupId={group.id} onRetry={members.reload} />
        ) : (
          <>
            <TextField
              ref={searchRef}
              label={copy.roster.filterLabel}
              placeholder={copy.roster.filterPlaceholder}
              type="search"
              autoComplete="off"
              aria-keyshortcuts="/"
              counter={<span className="hidden lg:inline">{copy.roster.activeCount(activeTotal)}</span>}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="lg:[&_input]:pr-12"
              end={
                <kbd className="hidden h-6 min-w-6 items-center justify-center rounded-sm border border-border px-1.5 font-mono text-caption text-text-3 lg:inline-flex">
                  {copy.roster.searchKey}
                </kbd>
              }
            />

            {active.length === 0 ? (
              <p role="status" className="py-3 text-body text-text-2">
                {copy.roster.noMatch}
              </p>
            ) : (
              <MemberList members={active} label={copy.roster.listLabel} onRemove={askRemove} />
            )}
          </>
        )}
      </Section>

      {removedTotal > 0 && (
        <section className="flex flex-col gap-card-gap">
          <h2>
            <button
              type="button"
              aria-expanded={showRemoved}
              aria-controls={removedId}
              onClick={() => setShowRemoved((v) => !v)}
              className="-ml-2 inline-flex min-h-12 items-center gap-1.5 rounded-md px-2 text-heading text-text-1 transition-colors duration-fast hover:bg-surface"
            >
              <Icon
                icon="chevronRight"
                className={cn("shrink-0 text-text-2 transition-transform duration-fast", showRemoved && "rotate-90")}
              />
              {copy.roster.removedSection(removedTotal)}
            </button>
          </h2>
          <div id={removedId} hidden={!showRemoved}>
            {removed.length === 0 ? (
              <p className="py-3 text-body text-text-2">{copy.roster.noMatch}</p>
            ) : (
              <MemberList members={removed} label={copy.roster.removedListLabel} />
            )}
          </div>
        </section>
      )}

      <ConfirmSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={target ? copy.members.removeTitle(target.displayName) : copy.members.remove}
        body={copy.members.removeBody}
        confirmLabel={copy.members.removeConfirm}
        confirmIcon="removeMember"
        busyLabel={copy.common.loading}
        destructive
        onConfirm={remove}
      />
    </>
  );
}

/**
 * R6 / S6: new members' commitments wait in a queue until the admin signs `add_members`, which
 * runs whenever the admin opens the roster. Running shows a status row, done is a toast, and a
 * failure stays on screen with "Try again" (new members can't answer new polls until it works).
 */
function AddingMembers({ groupId, onAdded }: { groupId: string; onAdded: () => void }) {
  const [state, setState] = useState<{ kind: "idle" } | { kind: "running" | "failed"; count: number }>({ kind: "idle" });
  const onAddedRef = useRef(onAdded);
  useEffect(() => {
    onAddedRef.current = onAdded;
  });

  const run = useCallback(
    async (count: number) => {
      setState({ kind: "running", count });
      try {
        const added = await repo.addPendingMembers(groupId);
        setState({ kind: "idle" });
        if (added > 0) {
          notify.success(copy.addingMembers.done(added));
          onAddedRef.current();
        }
      } catch (e) {
        console.warn("[lihim/members] adding queued members failed:", e);
        setState({ kind: "failed", count });
      }
    },
    [groupId],
  );

  useEffect(() => {
    let live = true;
    repo.countPendingMembers(groupId).then(
      (n) => {
        if (live && n > 0) void run(n);
      },
      (e: unknown) => {
        // Can't tell how many are queued: still try, quietly (the queue keeps them for next time).
        console.warn("[lihim/members] counting queued members failed:", e);
        repo.addPendingMembers(groupId).then(
          (added) => {
            if (live && added > 0) onAddedRef.current();
          },
          (err: unknown) => console.warn("[lihim/members] adding queued members failed:", err),
        );
      },
    );
    return () => {
      live = false;
    };
  }, [groupId, run]);

  if (state.kind === "running")
    return (
      <StatusRow state="running" title={copy.addingMembers.running(state.count)} body={copy.addingMembers.runningBody} />
    );
  if (state.kind === "failed")
    return (
      <StatusRow
        state="failed"
        title={copy.addingMembers.failed(state.count)}
        body={copy.addingMembers.failedBody}
        action={
          <Button icon="retry" variant="secondary" block={false} onClick={() => void run(state.count)}>
            {copy.addingMembers.retry}
          </Button>
        }
      />
    );
  return null;
}

/** Rows below lg, a table at ≥ lg in the shell (spec §3 "Lists") (sort by name or joined date). `onRemove` omitted = removed members. */
function MemberList({ members, label, onRemove }: { members: Member[]; label: string; onRemove?: (m: Member) => void }) {
  const removed = !onRemove;
  const menu = (m: Member, className?: string) =>
    onRemove &&
    !m.isAdmin && (
      <OverflowMenu
        label={copy.roster.options(m.displayName)}
        items={[{ label: copy.members.remove, icon: "removeMember", onSelect: () => onRemove(m), destructive: true }]}
        className={className}
      />
    );
  const role = (m: Member) => (removed ? copy.roster.removedOn : m.isAdmin ? copy.roster.adminTag : copy.roster.roleMember);

  const columns: DataTableColumn<Member>[] = [
    {
      key: "name",
      header: copy.roster.colName,
      cell: (m) => <span className="break-words">{m.displayName}</span>,
      sortValue: (m) => m.displayName.toLocaleLowerCase(LOCALE),
    },
    {
      key: "joined",
      header: copy.roster.colJoined,
      cell: (m) => <span className="text-text-2 tabular">{formatDate(m.joinedAt)}</span>,
      sortValue: (m) => m.joinedAt,
      width: "28%",
    },
    {
      key: "role",
      header: copy.roster.colRole,
      cell: (m) => <span className="text-text-2">{role(m)}</span>,
      width: "18%",
    },
  ];
  if (!removed)
    columns.push({
      key: "actions",
      header: copy.roster.colActions,
      headerHidden: true,
      align: "end",
      width: "5rem",
      cell: (m) => menu(m, REVEAL_ON_ROW_HOVER),
    });

  return (
    <>
      <ul
        aria-label={label}
        className={cn("divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-raised", HIDE_IN_SHELL_LG)}
      >
        {members.map((m) => (
          <li key={m.id} className="flex min-h-14 items-center gap-3 py-2 pr-1 pl-4">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn("truncate text-body", removed ? "text-text-2" : "text-text-1")}>{m.displayName}</span>
              <span className="text-caption text-text-2">
                {copy.members.joined(formatDate(m.joinedAt))}
                {removed ? ` · ${copy.roster.removedOn}` : m.isAdmin && ` · ${copy.roster.adminTag}`}
              </span>
            </div>
            {menu(m)}
          </li>
        ))}
      </ul>
      <div className={SHOW_IN_SHELL_LG}>
        <DataTable columns={columns} rows={members} rowKey={(m) => m.id} caption={label} />
      </div>
    </>
  );
}
