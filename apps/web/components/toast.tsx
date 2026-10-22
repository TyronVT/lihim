"use client";

import { Toaster as Sonner, toast as sonnerToast } from "sonner";

/**
 * App-wide toaster. Mount once (app/layout.tsx). Bottom, --surface-raised, 4 s,
 * one visible at a time.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      visibleToasts={1}
      duration={4000}
      gap={8}
      offset={{ bottom: "calc(24px + env(safe-area-inset-bottom))" }}
      mobileOffset={{ bottom: "calc(16px + env(safe-area-inset-bottom))", left: "16px", right: "16px" }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full max-w-[448px] items-center gap-3 rounded-md border border-border bg-surface-raised px-4 py-3 text-label text-text-1 shadow-raised",
          title: "text-label text-text-1",
          description: "text-caption text-text-2",
          icon: "shrink-0",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-danger",
          warning: "[&_[data-icon]]:text-warning",
          actionButton: "ml-auto shrink-0 rounded-sm px-2 py-1 text-label text-text-1 underline underline-offset-4",
        },
      }}
    />
  );
}

/**
 * Show a toast. Replaces any visible one (max one at a time).
 * @example notify(copy.common.copied) · notify.success(copy.join.joinedShort)
 */
export const notify = Object.assign(
  (message: string) => {
    sonnerToast.dismiss();
    return sonnerToast(message);
  },
  {
    success: (message: string) => {
      sonnerToast.dismiss();
      return sonnerToast.success(message);
    },
    error: (message: string) => {
      sonnerToast.dismiss();
      return sonnerToast.error(message);
    },
  },
);
