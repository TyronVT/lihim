"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, type ReactNode } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import type { Glyph } from "./glyphs";
import { Icon, type IconName } from "./icons";

export interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Element that opens the sheet (rendered via Radix Trigger asChild). */
  trigger?: ReactNode;
  /** Required for screen readers; hide visually with `hideTitle`. */
  title: ReactNode;
  hideTitle?: boolean;
  description?: ReactNode;
  children?: ReactNode;
  /** Pinned actions at the bottom of the sheet. */
  footer?: ReactNode;
  className?: string;
}

/**
 * Responsive sheet (Radix Dialog; lihim-UIUX-SPEC.md §3 "ResponsiveSheet"):
 * - compact (< 768): bottom sheet, radius 16 top, slides up 200 ms.
 * - medium and up: centred 480 px dialog, radius 16, fades in with an 8 px rise.
 * Both: focus-trapped, Esc / scrim click closes, focus returns to the opener.
 */
export function Sheet({ open, onOpenChange, trigger, title, hideTitle, description, children, footer, className }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=closed]:opacity-0 data-[state=open]:animate-fade-in" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-app flex-col rounded-t-lg border border-b-0 border-border bg-surface shadow-raised",
            "data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
            // ≥ md: centred dialog. Centred with margins (not translate) so the animation's transform is free.
            "md:inset-0 md:m-auto md:h-fit md:rounded-lg md:border-b",
            "md:data-[state=open]:animate-dialog-in md:data-[state=closed]:animate-dialog-out",
            className,
          )}
        >
          <div className="flex items-start gap-2 px-gutter pt-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-2.5">
              <Dialog.Title className={cn("text-heading text-text-1", hideTitle && "sr-only")}>{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-body text-text-2">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label={copy.common.close}
              className="-mr-2 inline-flex size-12 shrink-0 items-center justify-center rounded-md text-text-2 hover:text-text-1"
            >
              <Icon icon="close" />
            </Dialog.Close>
          </div>
          {children && <div className="overflow-y-auto px-gutter pt-4 pb-4">{children}</div>}
          {footer && (
            <div className="flex flex-col gap-3 px-gutter pt-2 pb-[calc(16px+env(safe-area-inset-bottom))] md:pb-4">{footer}</div>
          )}
          {!footer && <div className="pb-[env(safe-area-inset-bottom)] md:pb-2" />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface ConfirmSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel: string;
  /** Leading icon on the confirm button (e.g. "removeMember", "linkOff", "leave"). */
  confirmIcon?: IconName | Glyph;
  cancelLabel?: string;
  /** Destructive confirm (remove member). */
  destructive?: boolean;
  /** May be async; the sheet shows the busy label and closes on success. Throw to keep it open. */
  onConfirm: () => void | Promise<void>;
  busyLabel?: string;
}

/** Confirmation sheet. Every destructive action goes through one of these. */
export function ConfirmSheet({
  open: openProp,
  onOpenChange,
  trigger,
  title,
  body,
  confirmLabel,
  confirmIcon,
  cancelLabel = copy.common.cancel,
  destructive,
  onConfirm,
  busyLabel = copy.common.loading,
}: ConfirmSheetProps) {
  const [inner, setInner] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = openProp ?? inner;
  const setOpen = (v: boolean) => {
    if (busy) return;
    setInner(v);
    onOpenChange?.(v);
  };
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      setBusy(false);
      setInner(false);
      onOpenChange?.(false);
    } catch {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={title}
      description={body}
      footer={
        <>
          <Button variant={destructive ? "destructive" : "primary"} icon={confirmIcon} onClick={confirm} loading={busy} loadingLabel={busyLabel}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            {cancelLabel}
          </Button>
        </>
      }
    />
  );
}
