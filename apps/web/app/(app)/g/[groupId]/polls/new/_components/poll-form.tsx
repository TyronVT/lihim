"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AnonymityBanner,
  AppBar,
  Button,
  Card,
  FooterLinks,
  HIDE_IN_SHELL_LG,
  Icon,
  PageHeader,
  PinnedFooter,
  Screen,
  SegmentedControl,
  ShellHeader,
  SmallGroupWarning,
  Switch,
  TextArea,
  TextField,
  notify,
} from "@/components";
import { copy } from "@/lib/copy";
import { PollNotOpenedError, repo, SmallGroupError, type Group, type PollKind } from "@/lib/data";
import { formatWhen } from "@/lib/format";
import { MEDIA, useMediaQuery } from "@/lib/media";
import { isSmallGroup, MAX_POLL_OPTIONS } from "@/lib/poll";
import { cn } from "@/lib/cn";
import { InviteSheet } from "../../../_components/invite-sheet";
import { PollPreview } from "./poll-preview";
import { ReviewSheet } from "./review-sheet";
import {
  DEFAULT_PRESET,
  MAX_OPEN_MS,
  MIN_OPEN_MS,
  fromLocalInputValue,
  presetClosesAt,
  toLocalInputValue,
  validateClosing,
  type ClosingPreset,
} from "./closing";

const t = copy.newPoll;
const FORM_ID = "new-poll-form";
const QUESTION_ID = "poll-question";
const CLOSES_ID = "poll-closes-at";
const OPTIONS_ERROR_ID = "poll-options-error";
const OPTIONS_HINT_ID = "poll-options-hint";
const QUESTION_MAX = 140;
const OPTION_MAX = 60;
const MIN_OPTIONS = 2;

// Same look as the shared TextField control; options need a compact row with an inline
// remove button, which TextField's label-above shell doesn't allow.
const optionInput =
  "h-12 w-full min-w-0 flex-1 rounded-sm border border-border-control bg-surface px-3 text-body text-text-1 " +
  "placeholder:text-text-3 transition-[border-color] duration-fast hover:border-text-3 aria-invalid:border-danger disabled:opacity-40";

const KIND_OPTIONS: { value: PollKind; label: string }[] = [
  { value: "single", label: copy.poll.kindSingle },
  { value: "yesno", label: copy.poll.kindYesNo },
  { value: "rating", label: copy.poll.kindRating },
];

const PRESET_OPTIONS: { value: ClosingPreset; label: string }[] = [
  { value: "1d", label: t.preset1d },
  { value: "3d", label: t.preset3d },
  { value: "1w", label: t.preset1w },
  { value: "custom", label: t.presetCustom },
];

interface OptionDraft {
  key: number;
  label: string;
}

function closesAtFor(preset: ClosingPreset, custom: string, now: number): number | null {
  return preset === "custom" ? fromLocalInputValue(custom) : presetClosesAt(preset, now);
}

/** L5 form. Rendered only for admins, after the group has loaded (so Date.now() is client-only). */
export function PollForm({ group, backHref }: { group: Group; backHref: string }) {
  const router = useRouter();
  // "now" is a snapshot so render stays pure; refreshed whenever we validate.
  const [now, setNow] = useState(() => Date.now());
  const [kind, setKind] = useState<PollKind>("single");
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState<OptionDraft[]>([
    { key: 1, label: "" },
    { key: 2, label: "" },
  ]);
  const nextKey = useRef(3);
  const [preset, setPreset] = useState<ClosingPreset>(DEFAULT_PRESET);
  const [custom, setCustom] = useState("");
  const [hideLiveTally, setHideLiveTally] = useState(true);
  const [showErrors, setShowErrors] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  // True from "Open poll" until we navigate away (or it fails and the admin can try again).
  const [opening, setOpening] = useState(false);
  // Behaviour only (layout stays in CSS: the preview rail shows from lg, beside the form at xl):
  // at ≥ xl the preview replaces the review sheet (spec L5 "Expanded").
  const wide = useMediaQuery(MEDIA.xl);
  // Set when the server says the group shrank below min_members since this screen loaded.
  const [serverBlock, setServerBlock] = useState<{ memberCount: number; minMembers: number } | null>(null);

  const inputs = useRef(new Map<number, HTMLInputElement>());
  const focusAfterRender = useRef<number | "add" | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const target = focusAfterRender.current;
    if (target === null) return;
    focusAfterRender.current = null;
    if (target === "add") addButton.current?.focus();
    else inputs.current.get(target)?.focus();
  }, [options]);

  const memberCount = serverBlock?.memberCount ?? group.memberCount;
  const minMembers = serverBlock?.minMembers ?? group.minMembers;
  const blocked = memberCount < minMembers;

  // ---- derived validation -------------------------------------------------
  const closesAt = closesAtFor(preset, custom, now);
  const closingError = validateClosing(closesAt, now);
  const filled = options.map((o) => o.label.trim()).filter(Boolean);
  const norm = (l: string) => l.trim().toLocaleLowerCase("en-PH");
  const seen = new Map<string, number>();
  for (const l of filled) seen.set(norm(l), (seen.get(norm(l)) ?? 0) + 1);
  const isDuplicate = (l: string) => !!l.trim() && (seen.get(norm(l)) ?? 0) > 1;
  const hasDuplicate = filled.some(isDuplicate);
  const optionsError =
    kind !== "single" ? null : filled.length < MIN_OPTIONS ? t.optionsRequired : hasDuplicate ? t.optionsDuplicate : null;
  const titleError = title.trim() ? null : t.questionRequired;
  const closingErrorText = closingError === "too-soon" ? t.closingTooSoon : closingError === "too-far" ? t.closingTooFar : null;

  // ---- options ------------------------------------------------------------
  const addOption = () => {
    if (options.length >= MAX_POLL_OPTIONS) return;
    const key = nextKey.current++;
    focusAfterRender.current = key;
    setOptions((prev) => [...prev, { key, label: "" }]);
  };

  const removeOption = (index: number) => {
    if (options.length <= MIN_OPTIONS) return;
    // Keep focus on a neighbour instead of dropping it to <body>.
    const neighbour = options[index - 1] ?? options[index + 1];
    focusAfterRender.current = neighbour?.key ?? "add";
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const setOptionLabel = (key: number, label: string) =>
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, label } : o)));

  // ---- closing ------------------------------------------------------------
  const pickPreset = (next: ClosingPreset) => {
    const fresh = Date.now();
    setNow(fresh);
    // Seed the picker with what the previous preset meant, so "Custom" starts somewhere sensible.
    if (next === "custom" && !custom) {
      setCustom(toLocalInputValue(closesAtFor(preset, custom, fresh) ?? presetClosesAt(DEFAULT_PRESET, fresh)));
    }
    setPreset(next);
  };

  // ---- submit -------------------------------------------------------------
  const openPoll = async () => {
    if (closesAt === null || opening) return;
    setOpening(true);
    try {
      // With NEXT_PUBLIC_DATA=supabase this signs `create_poll` with the per-group admin key and
      // sends it via `submit-admin-tx` (lib/data/supabase.ts). The contract freezes the root +
      // size and rejects when size < min_members (→ SmallGroupError).
      await repo.createPoll({
        groupId: group.id,
        title: title.trim(),
        kind,
        optionLabels: kind === "single" ? filled : undefined,
        closesAt: new Date(closesAt).toISOString(),
        hideLiveTally,
      });
      // P6: it comes back as a draft ("Opening…") and opens once it lands; L3 shows that row.
      notify(t.openingToast);
      router.replace(backHref);
    } catch (err) {
      if (err instanceof SmallGroupError) {
        // Close the sheet and fall back to the blocked state; the card explains why.
        setOpening(false);
        setReviewOpen(false);
        setServerBlock({ memberCount: err.memberCount, minMembers: err.minMembers });
        return;
      }
      // createPoll may reject AFTER saving the poll as a "Didn't open" draft. Sending again from
      // here would make a second poll, so hand over to L3's "Try again" row when that happened.
      if (err instanceof PollNotOpenedError) {
        notify.error(t.didntOpen);
        router.replace(backHref);
        return;
      }
      setOpening(false);
      notify.error(t.failed); // the review sheet stays open for another try
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    const fresh = Date.now();
    setNow(fresh);
    const freshClosingError = validateClosing(closesAtFor(preset, custom, fresh), fresh);
    if (titleError || optionsError || freshClosingError) {
      setShowErrors(true);
      if (titleError) document.getElementById(QUESTION_ID)?.focus();
      else if (optionsError) inputs.current.get(options.find((o) => !o.label.trim())?.key ?? options[0]!.key)?.focus();
      else document.getElementById(CLOSES_ID)?.focus();
      return;
    }
    // ≥ 1280: the preview beside the form already showed what members get.
    if (wide) void openPoll();
    else setReviewOpen(true);
  };

  const showSmallWarning = !blocked && isSmallGroup(memberCount);

  const primary = (
    <Button icon="openPoll" type="submit" form={FORM_ID} disabled={blocked} loading={opening} loadingLabel={t.opening}>
      {t.openCta}
    </Button>
  );

  const preview = !blocked ? (
      <PollPreview
        kind={kind}
        title={title}
        optionLabels={options.map((o) => o.label)}
        closesAt={closingError ? null : closesAt}
        now={now}
        memberCount={memberCount}
      />
    ) : undefined;

  return (
    <>
      <AppBar title={t.title} backHref={backHref} />
      <Screen
        withFooter
        width="form"
        header={
          <ShellHeader
            back={{ href: backHref, label: group.name }}
            title={t.title}
            context={t.heading(group.name)}
            actions={primary}
          />
        }
        rail={preview}
        railFrom="lg"
        railLabel={t.previewTitle}
      >
        <div className="flex flex-col gap-4">
          {/* No hero above the fold on desktop (spec §3); the page header names the group. */}
          <PageHeader illustration="poll" illustrationSize={64} title={t.heading(group.name)} className={HIDE_IN_SHELL_LG} />
          {blocked ? (
            <SmallGroupWarning
              variant="blocking"
              memberCount={memberCount}
              minMembers={minMembers}
              action={
                <InviteSheet
                  groupId={group.id}
                  groupName={group.name}
                  trigger={
                    <Button variant="secondary" icon="invite">
                      {t.blockedInvite}
                    </Button>
                  }
                />
              }
            />
          ) : (
            <AnonymityBanner>{copy.anonymity.bannerCreatePoll}</AnonymityBanner>
          )}
          {showSmallWarning && <SmallGroupWarning />}
        </div>

        <form id={FORM_ID} noValidate onSubmit={onSubmit}>
          {/* A disabled fieldset disables every native control inside it in one place. */}
          <fieldset disabled={blocked} className="flex min-w-0 flex-col gap-6">
            <legend className="sr-only">{t.title}</legend>

            <div className="flex flex-col gap-2">
              <span aria-hidden className="text-label text-text-2">
                {t.kindLabel}
              </span>
              <SegmentedControl label={t.kindLabel} value={kind} onValueChange={setKind} options={KIND_OPTIONS} disabled={blocked} />
            </div>

            <TextArea
              id={QUESTION_ID}
              label={t.question}
              placeholder={t.questionPlaceholder}
              rows={2}
              maxLength={QUESTION_MAX}
              counter={`${title.length}/${QUESTION_MAX}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={showErrors ? titleError : undefined}
              required
            />

            {kind === "single" ? (
              <div role="group" aria-labelledby="poll-options-label" className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span id="poll-options-label" className="text-label text-text-2">
                    {t.options}
                  </span>
                  <span aria-live="polite" className="text-caption text-text-3 tabular">
                    {t.optionCount(options.length, MAX_POLL_OPTIONS)}
                  </span>
                </div>
                <ol className="flex flex-col gap-2">
                  {options.map((o, i) => {
                    const invalid =
                      showErrors && !!optionsError && (hasDuplicate ? isDuplicate(o.label) : !o.label.trim());
                    return (
                      <li key={o.key} className="flex items-center gap-2">
                        <input
                          ref={(el) => {
                            if (el) inputs.current.set(o.key, el);
                            else inputs.current.delete(o.key);
                          }}
                          aria-label={t.optionLabel(i + 1)}
                          placeholder={t.optionPlaceholder(i + 1)}
                          maxLength={OPTION_MAX}
                          value={o.label}
                          onChange={(e) => setOptionLabel(o.key, e.target.value)}
                          aria-invalid={invalid || undefined}
                          aria-describedby={showErrors && optionsError ? OPTIONS_ERROR_ID : OPTIONS_HINT_ID}
                          className={optionInput}
                        />
                        {options.length > MIN_OPTIONS && (
                          <button
                            type="button"
                            aria-label={t.removeOption(i + 1)}
                            onClick={() => removeOption(i)}
                            className="inline-flex size-12 shrink-0 items-center justify-center rounded-md text-text-2 transition-colors duration-fast hover:bg-surface hover:text-text-1 disabled:opacity-40"
                          >
                            <Icon icon="close" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <Button
                  ref={addButton}
                  variant="secondary"
                  onClick={addOption}
                  disabled={blocked || options.length >= MAX_POLL_OPTIONS}
                  icon="plus"
                >
                  {t.addOption}
                </Button>
                {showErrors && optionsError ? (
                  <p id={OPTIONS_ERROR_ID} className="text-caption text-danger">
                    {optionsError}
                  </p>
                ) : (
                  <p id={OPTIONS_HINT_ID} className="text-caption text-text-3">
                    {copy.poll.maxOptions}
                  </p>
                )}
              </div>
            ) : (
              <Card className="flex items-start gap-3">
                <Icon icon="poll" className="mt-0.5 shrink-0 text-text-2" />
                <p className="text-label text-text-2">{kind === "yesno" ? t.yesNoPreview : t.ratingPreview}</p>
              </Card>
            )}

            <div className="flex flex-col gap-3">
              <span aria-hidden className="text-label text-text-2">
                {t.closing}
              </span>
              <SegmentedControl
                label={t.closingPresets}
                value={preset}
                onValueChange={pickPreset}
                options={PRESET_OPTIONS}
                disabled={blocked}
              />
              {preset === "custom" && (
                <TextField
                  id={CLOSES_ID}
                  type="datetime-local"
                  label={t.customLabel}
                  value={custom}
                  min={toLocalInputValue(now + MIN_OPEN_MS)}
                  max={toLocalInputValue(now + MAX_OPEN_MS)}
                  onChange={(e) => setCustom(e.target.value)}
                  error={showErrors ? closingErrorText : undefined}
                />
              )}
              <p aria-live="polite" className={cn("flex items-center gap-2 text-label", closingError ? "text-text-3" : "text-text-1")}>
                <Icon icon="closing" className="shrink-0 text-text-2" />
                {closesAt !== null && !closingError ? t.closesPreview(formatWhen(closesAt, now)) : t.closingTooSoon}
              </p>
            </div>

            <Switch
              checked={hideLiveTally}
              onCheckedChange={setHideLiveTally}
              label={copy.poll.hideResults}
              description={hideLiveTally ? copy.poll.hideResultsHelp : t.liveResultsHelp}
              disabled={blocked}
            />
          </fieldset>
        </form>
        <FooterLinks />
      </Screen>

      <PinnedFooter>
        {!blocked && <p className="text-caption text-text-3 tabular">{t.frozenNote(memberCount)}</p>}
        {primary}
      </PinnedFooter>

      <ReviewSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        busy={opening}
        onConfirm={() => void openPoll()}
        review={{
          kind,
          title: title.trim(),
          optionLabels: filled,
          closesAt: closesAt !== null ? formatWhen(closesAt, now) : "",
          memberCount,
          hideLiveTally,
        }}
      />
    </>
  );
}
