import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";

export interface AnonymityBannerProps {
  /** Override the line (see copy.anonymity.*). Default "Anonymous to the group and the public." */
  children?: ReactNode;
  className?: string;
}

/** eye-off + one line, --surface-raised, radius 12. On L2, L5 and L6. */
export function AnonymityBanner({ children = copy.anonymity.banner, className }: AnonymityBannerProps) {
  return (
    <div className={cn("flex items-start gap-3 rounded-md bg-surface-raised px-4 py-3 shadow-raised", className)}>
      <Icon icon="anonymous" className="mt-0.5 shrink-0 text-text-2" />
      <p className="text-label text-text-1">{children}</p>
    </div>
  );
}

export interface SmallGroupWarningProps {
  /**
   * inline   → one-line warning (L5/L7 when frozen size < 15).
   * blocking → card that explains why polls can't open (L5 below min_members); render the
   *            disabled form beneath it.
   */
  variant?: "inline" | "blocking";
  /** Blocking only. */
  memberCount?: number;
  minMembers?: number;
  /** Blocking only: e.g. an "Invite link" button. */
  action?: ReactNode;
  className?: string;
}

/** triangle-alert in --warning + "Small groups can still guess who voted what." */
export function SmallGroupWarning({ variant = "inline", memberCount = 0, minMembers = 8, action, className }: SmallGroupWarningProps) {
  if (variant === "inline") {
    return (
      <p className={cn("flex items-start gap-2 text-label text-text-1", className)}>
        <Icon icon="warning" className="mt-0.5 shrink-0 text-warning" />
        {copy.smallGroup.warning}
      </p>
    );
  }
  return (
    <div role="alert" className={cn("flex flex-col gap-3 rounded-lg border border-warning/40 bg-surface p-card shadow-raised", className)}>
      <div className="flex items-start gap-3">
        <Icon icon="warning" className="mt-0.5 shrink-0 text-warning" />
        <div className="flex flex-col gap-1">
          <p className="text-heading text-text-1">{copy.smallGroup.blockedTitle}</p>
          <p className="text-body text-text-2">{copy.smallGroup.blockedBody(minMembers, memberCount)}</p>
          <p className="text-label text-text-1">{copy.smallGroup.warning}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

type NoticeTone = "info" | "success" | "warning" | "danger";
const TONE: Record<NoticeTone, { icon: IconName | typeof Info; className: string }> = {
  info: { icon: Info, className: "text-text-2" },
  success: { icon: CircleCheck, className: "text-success" },
  warning: { icon: "warning", className: "text-warning" },
  danger: { icon: CircleAlert, className: "text-danger" },
};

export interface NoticeProps {
  tone?: NoticeTone;
  title: ReactNode;
  children?: ReactNode;
  /** Override the tone's icon (e.g. "verified"). */
  icon?: IconName | typeof Info;
  action?: ReactNode;
  className?: string;
}

/**
 * Status card with icon + words (status is never colour-only). E.g. L6 already-answered:
 * <Notice tone="danger" title={copy.vote.alreadyAnswered}>{copy.vote.alreadyAnsweredBody}</Notice>
 * and the network-failure message.
 */
export function Notice({ tone = "info", title, children, icon, action, className }: NoticeProps) {
  const t = TONE[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn("flex flex-col gap-3 rounded-lg border border-border bg-surface p-card shadow-raised", className)}
    >
      <div className="flex items-start gap-3">
        <Icon icon={icon ?? t.icon} className={cn("mt-0.5 shrink-0", t.className)} />
        <div className="flex flex-col gap-1">
          <p className={cn("text-heading", tone === "info" ? "text-text-1" : t.className)}>{title}</p>
          {children && <div className="text-body text-text-2">{children}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}
