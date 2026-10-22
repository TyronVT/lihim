"use client";

import { Share2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AppBar,
  Button,
  Card,
  Icon,
  Notice,
  PageHeader,
  PinnedFooter,
  Screen,
  Section,
  SegmentedControl,
  Stepper,
  TextArea,
  TextField,
  notify,
} from "@/components";
import { copy } from "@/lib/copy";
import { repo, type Group, type Invite } from "@/lib/data";
import { useMutation } from "@/lib/data/hooks";
import { formatWhen } from "@/lib/format";
import { DEFAULT_MIN_MEMBERS, MIN_MIN_MEMBERS } from "@/lib/poll";

const FORM_ID = "create-group-form";
const NAME_ID = "group-name";
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

function CreateForm({ onCreated }: { onCreated: (c: Created) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [minMembers, setMinMembers] = useState(DEFAULT_MIN_MEMBERS);
  const [expiry, setExpiry] = useState<Expiry>("168");
  const [maxUses, setMaxUses] = useState<MaxUses>("50");
  const [showErrors, setShowErrors] = useState(false);

  const create = useMutation(async () => {
    // TODO(M0): real flow (orchestrator D1) — the browser generates groups.id (uuid) first;
    // passkey PRF → per-group admin Ed25519 key (HKDF info "lihim/admin/" + groups.id); sign
    // `create_group` (contracts/INTERFACE.md digest) over the PREDICTED on-chain u64 id
    // (semaphore.next_group_id(), nonce 0; retry if taken) and send via `submit-admin-tx`.
    // The admin then joins with their own commitment ("lihim/sem/" + groups.id).
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
      onCreated(await create.run());
    } catch {
      // create.error drives the Notice below.
    }
  };

  return (
    <>
      <AppBar title={copy.createGroup.title} backHref="/" />
      <Screen withFooter>
        <PageHeader illustration="group" illustrationSize={64} title={copy.createGroup.heading} description={copy.createGroup.intro} />

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

          {create.error !== undefined && <Notice tone="danger" title={copy.createGroup.failed} />}
        </form>
      </Screen>
      <PinnedFooter>
        <Button type="submit" form={FORM_ID} loading={create.pending} loadingLabel={copy.createGroup.creating}>
          {copy.group.create}
        </Button>
      </PinnedFooter>
    </>
  );
}

function Ready({ created }: { created: Created }) {
  const { group, invite } = created;
  const heading = useRef<HTMLHeadingElement>(null);
  const [canShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");
  // Ready only ever renders after a client-side submit, so window is always defined here.
  const url = invite ? new URL(invite.url, window.location.origin).toString() : "";

  // Move focus to the new heading so screen readers land on the result, not a stale field.
  useEffect(() => heading.current?.focus(), []);

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

  return (
    <>
      <AppBar title={copy.createGroup.title} backHref="/" />
      <Screen withFooter>
        <div role="status" className="flex animate-rise-in flex-col gap-3">
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
              <Button variant="secondary" onClick={copyLink} disabled={!url}>
                <Icon icon="copy" />
                {copy.createGroup.copyLink}
              </Button>
              {canShare && (
                <Button variant="secondary" onClick={share} disabled={!url}>
                  <Icon icon={Share2} />
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
      <PinnedFooter>
        <Button asChild>
          <Link href={groupHref}>{copy.createGroup.goToGroup}</Link>
        </Button>
      </PinnedFooter>
    </>
  );
}
