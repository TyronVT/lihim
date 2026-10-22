"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AppBar,
  Button,
  Card,
  HIDE_IN_SHELL_LG,
  Icon,
  Notice,
  PageHeader,
  PinnedFooter,
  Screen,
  Section,
  SegmentedControl,
  ShellHeader,
  Stepper,
  TextArea,
  TextField,
  notify,
  useShell,
} from "@/components";
import { copy } from "@/lib/copy";
import { repo, type Group, type Invite } from "@/lib/data";
import { useMutation } from "@/lib/data/hooks";
import { formatWhen } from "@/lib/format";
import { cn } from "@/lib/cn";
import { DEFAULT_MIN_MEMBERS, MIN_MIN_MEMBERS } from "@/lib/poll";

const FORM_ID = "create-group-form";
const NAME_ID = "group-name";
const FAILED_ID = "create-group-failed";
const NAME_MAX = 60;
const DESCRIPTION_MAX = 200;
/** Upper bound for the stepper; a bigger floor would just block polls in most orgs. */
const MAX_MIN_MEMBERS = 100;

type Expiry = "24" | "168" | "720";
const EXPIRY_OPTIONS: { value: Expiry; label: string }[] = [
  { value: "24", label: copy.createGroup.expiry1d },
  { value: "168", label: copy.createGroup.expiry7d },
  { value: "720", label: copy.createGroup.expiry30d },
];

type MaxUses = "25" | "50" | "100" | "none";
const MAX_USES_OPTIONS: { value: MaxUses; label: string }[] = [
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "none", label: copy.createGroup.maxUsesNone },
];

interface Created {
  group: Group;
  invite: Invite | null;
}

/** L1 — create group, then hand the admin an invite link on the same screen. */
export function CreateGroupScreen() {
  const [created, setCreated] = useState<Created | null>(null);
  return created ? <Ready created={created} /> : <CreateForm onCreated={setCreated} />;
}

/**
 * ≥ 1280 rail (spec L1 "Expanded"): a static "How groups work" card. Below that it is hidden
 * (Screen railFrom="xl"); the hint under each field already says the same thing.
 */
function HowGroupsWork() {
  const items = [
    { icon: "anonymous", title: copy.createGroup.howWhoTitle, body: copy.createGroup.howWhoBody },
    { icon: "members", title: copy.createGroup.howMinTitle, body: copy.createGroup.howMinBody },
    { icon: "invite", title: copy.createGroup.howInviteTitle, body: copy.createGroup.howInviteBody },
  ] as const;
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-heading text-text-1">{copy.createGroup.howTitle}</h2>
      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={item.title} className="flex items-start gap-3">
            <Icon icon={item.icon} className="mt-0.5 shrink-0 text-text-2" />
            <div className="flex flex-col gap-1">
              <h3 className="text-label font-medium text-text-1">{item.title}</h3>
              <p className="text-label text-text-2">{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CreateForm({ onCreated }: { onCreated: (c: Created) => void }) {
  const { refreshGroups } = useShell();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [minMembers, setMinMembers] = useState(DEFAULT_MIN_MEMBERS);
  const [expiry, setExpiry] = useState<Expiry>("168");
  const [maxUses, setMaxUses] = useState<MaxUses>("50");
  const [showErrors, setShowErrors] = useState(false);

  const create = useMutation(async () => {
    // With NEXT_PUBLIC_DATA=supabase this picks groups.id in the browser, signs `create_group`
    // with the per-group admin key over the predicted next_group_id (re-signing on 409
    // stale_signature) and queues the admin's own commitment (lib/data/supabase.ts).
    const group = await repo.createGroup({ name: name.trim(), description: description.trim(), minMembers });
    // The group exists even if the link fails; the admin can mint one from L3.
    const invite = await repo
      .createInvite(group.id, {
        expiresInHours: Number(expiry),
        maxUses: maxUses === "none" ? null : Number(maxUses),
      })
      .catch(() => null);
    return { group, invite };
  });

  const nameError = name.trim() ? null : copy.createGroup.nameRequired;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (nameError) {
      setShowErrors(true);
      document.getElementById(NAME_ID)?.focus();
      return;
    }
    try {
      const result = await create.run();
      // The sidebar lists the new group straight away (≥ lg).
      refreshGroups();
      onCreated(result);
    } catch {
      // create.error drives the Notice below. At ≥ lg the button is up in the page header,
      // so bring the error into view.
      requestAnimationFrame(() => document.getElementById(FAILED_ID)?.scrollIntoView({ block: "nearest" }));
    }
  };

  const primary = (
    <Button icon="createGroup" type="submit" form={FORM_ID} loading={create.pending} loadingLabel={copy.createGroup.creating}>
      {copy.group.create}
    </Button>
  );

  return (
    <>
      <AppBar title={copy.createGroup.title} backHref="/" />
      <Screen
        withFooter
        width="form"
        header={<ShellHeader title={copy.createGroup.title} context={copy.createGroup.intro} actions={primary} />}
        rail={<HowGroupsWork />}
        railFrom="xl"
      >
        {/* At ≥ lg the page header carries the title and intro; no hero above the form there. */}
        <PageHeader
          illustration="group"
          illustrationSize={64}
          title={copy.createGroup.heading}
          description={copy.createGroup.intro}
          className={HIDE_IN_SHELL_LG}
        />

        <form id={FORM_ID} noValidate onSubmit={onSubmit} className="flex flex-col gap-section">
          <fieldset disabled={create.pending} className="flex min-w-0 flex-col gap-6">
            <legend className="sr-only">{copy.createGroup.title}</legend>
            <TextField
              id={NAME_ID}
              label={copy.createGroup.name}
              placeholder={copy.createGroup.namePlaceholder}
              autoComplete="off"
              maxLength={NAME_MAX}
              counter={`${name.length}/${NAME_MAX}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={showErrors ? nameError : undefined}
              required
            />
            <TextArea
              label={copy.createGroup.description}
              placeholder={copy.createGroup.descriptionPlaceholder}
              hint={copy.createGroup.descriptionHint}
              maxLength={DESCRIPTION_MAX}
              counter={`${description.length}/${DESCRIPTION_MAX}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Stepper
              label={copy.createGroup.minSize}
              unit={copy.createGroup.minSizeUnit}
              value={minMembers}
              onChange={setMinMembers}
              min={MIN_MIN_MEMBERS}
              max={MAX_MIN_MEMBERS}
              hint={copy.smallGroup.minSizeHelp}
              disabled={create.pending}
            />
          </fieldset>

          <Section title={copy.createGroup.inviteSettings}>
            <fieldset disabled={create.pending} className="flex min-w-0 flex-col gap-6">
              <legend className="sr-only">{copy.createGroup.inviteSettings}</legend>
              <div className="flex flex-col gap-2">
                <span aria-hidden className="text-label text-text-2">
                  {copy.createGroup.expiry}
                </span>
                <SegmentedControl label={copy.createGroup.expiry} value={expiry} onValueChange={setExpiry} options={EXPIRY_OPTIONS} />
              </div>
              <div className="flex flex-col gap-2">
                <span aria-hidden className="text-label text-text-2">
                  {copy.createGroup.maxUses}
                </span>
                <SegmentedControl label={copy.createGroup.maxUses} value={maxUses} onValueChange={setMaxUses} options={MAX_USES_OPTIONS} />
                <p className="text-caption text-text-3">{copy.createGroup.maxUsesHint}</p>
              </div>
            </fieldset>
          </Section>

          {/* S5: inline, right above the (pinned) button, with its own way to try again. */}
          {create.error !== undefined && (
            <div id={FAILED_ID}>
              <Notice
                tone="danger"
                title={copy.createGroup.failed}
                action={
                  <Button icon="retry" type="submit" variant="secondary">
                    {copy.common.retry}
                  </Button>
                }
              />
            </div>
          )}
        </form>
      </Screen>
      <PinnedFooter>{primary}</PinnedFooter>
    </>
  );
}

function Ready({ created }: { created: Created }) {
  const { group, invite } = created;
  // The title lives in the in-content header below lg and in the page header at ≥ lg.
  const heading = useRef<HTMLSpanElement>(null);
  const shellHeading = useRef<HTMLSpanElement>(null);
  const [canShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");
  // Ready only ever renders after a client-side submit, so window is always defined here.
  const url = invite ? new URL(invite.url, window.location.origin).toString() : "";

  // Move focus to the new heading so screen readers land on the result, not a stale field.
  // Only one of the two is displayed (the other is display: none, so it has no offsetParent).
  useEffect(() => {
    const visible = [shellHeading.current, heading.current].find((el) => el?.offsetParent);
    visible?.focus();
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      notify.success(copy.group.inviteCopied);
    } catch {
      notify.error(copy.common.copyFailed);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: group.name, text: copy.createGroup.shareText(group.name), url });
    } catch {
      // Dismissed share sheet.
    }
  };

  const groupHref = `/g/${encodeURIComponent(group.id)}`;
  const primary = (
    <Button icon="arrowRight" asChild>
      <Link href={groupHref}>{copy.createGroup.goToGroup}</Link>
    </Button>
  );

  return (
    <>
      <AppBar title={copy.createGroup.title} backHref="/" />
      <Screen
        withFooter
        width="form"
        header={
          <ShellHeader
            title={
              <span ref={shellHeading} tabIndex={-1}>
                {copy.createGroup.readyTitle(group.name)}
              </span>
            }
            context={copy.createGroup.readyBody}
            actions={primary}
          />
        }
      >
        <div role="status" className={cn("flex animate-rise-in flex-col gap-3", HIDE_IN_SHELL_LG)}>
          <PageHeader
            illustration="group"
            illustrationSize={64}
            title={
              <span ref={heading} tabIndex={-1}>
                {copy.createGroup.readyTitle(group.name)}
              </span>
            }
            description={copy.createGroup.readyBody}
          />
        </div>

        {invite ? (
          <Card className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-label text-text-2">{copy.createGroup.linkLabel}</span>
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="h-12 w-full rounded-sm border border-border-control bg-surface-raised px-3 font-mono text-mono text-text-1"
              />
            </label>
            {invite.expiresAt && (
              <p className="flex items-start gap-2 text-caption text-text-3">
                <Icon icon="invite" size={16} className="mt-px shrink-0" />
                <span>{copy.createGroup.linkExpires(formatWhen(invite.expiresAt))}</span>
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" icon="copy" onClick={copyLink} disabled={!url}>
                {copy.createGroup.copyLink}
              </Button>
              {canShare && (
                <Button variant="secondary" icon="share" onClick={share} disabled={!url}>
                  {copy.createGroup.share}
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <Notice tone="warning" title={copy.createGroup.inviteFailed} />
        )}

        <p className="flex items-start gap-2 text-label text-text-2">
          <Icon icon="members" className="mt-0.5 shrink-0" />
          <span className="tabular">{copy.createGroup.readyMin(group.minMembers)}</span>
        </p>
      </Screen>
      <PinnedFooter>{primary}</PinnedFooter>
    </>
  );
}
