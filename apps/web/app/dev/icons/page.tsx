import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button, Icon, Icons, type IconName } from "@/components";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Icons", robots: { index: false } };

const NAMES = Object.keys(Icons) as IconName[];

const BUTTONS: { icon: IconName; label: string; variant: "primary" | "secondary" | "destructive" }[] = [
  { icon: "passkey", label: "Sign in with passkey", variant: "primary" },
  { icon: "send", label: "Send answer", variant: "primary" },
  { icon: "openPoll", label: "Open poll", variant: "primary" },
  { icon: "createGroup", label: "Create group", variant: "primary" },
  { icon: "join", label: "Join group", variant: "primary" },
  { icon: "newPoll", label: "New poll", variant: "secondary" },
  { icon: "invite", label: "Invite link", variant: "secondary" },
  { icon: "retry", label: "Try again", variant: "secondary" },
  { icon: "signOut", label: "Sign out", variant: "secondary" },
  { icon: "leave", label: "Leave group", variant: "destructive" },
];

/** Contact sheet for the Lihim line icons (design/ICONS.md). Hidden in production unless dev routes are on. */
export default function DevIconsPage() {
  if (!env.devRoutes) notFound();
  return (
    <main id="main" className="mx-auto flex max-w-[1200px] flex-col gap-10 p-8 text-text-1">
      <h1 className="text-title">Lihim line icons ({NAMES.length})</h1>

      <section aria-label="All icons at 20, 24 and 48 px" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {NAMES.map((n) => (
          <div key={n} data-icon={n} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-end gap-4">
              <Icon icon={n} size={48} />
              <Icon icon={n} size={24} />
              <Icon icon={n} />
              <Icon icon={n} size={16} />
            </div>
            <span className="font-mono text-caption text-text-2">{n}</span>
          </div>
        ))}
      </section>

      <section aria-label="Icons on a 24 grid" className="grid grid-cols-3 gap-4 sm:grid-cols-6">
        {NAMES.map((n) => (
          <div key={n} className="flex flex-col items-center gap-1">
            <div
              className="relative size-[144px] rounded-sm border border-border"
              style={{
                backgroundImage:
                  "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
                backgroundSize: "6px 6px",
              }}
            >
              <Icon icon={n} size={144} />
            </div>
            <span className="font-mono text-caption text-text-3">{n}</span>
          </div>
        ))}
      </section>

      <section aria-label="Buttons" className="flex max-w-[560px] flex-col gap-3">
        {BUTTONS.map((b) => (
          <Button key={b.label} variant={b.variant}>
            <Icon icon={b.icon} />
            {b.label}
          </Button>
        ))}
      </section>
    </main>
  );
}
