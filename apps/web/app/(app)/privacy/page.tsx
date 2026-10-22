import type { Metadata } from "next";
import { AppBar, Card, HIDE_IN_SHELL_LG, Icon, Illustration, Screen, Section, ShellHeader, SmallGroupWarning } from "@/components";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.privacy.title };

/**
 * L8 — Who can see what (UC02). Static explainer, so a server component. The theme picker moved
 * to L10 Settings (R12). ≥ lg: app shell when signed in, focused shell when not (the auth gate
 * decides); 640 reading column; the ShellHeader band holds the h1 and intro, so the in-content
 * hero hides there; the three "who sees what" rows become three columns, icon on top.
 */
export default function PrivacyPage() {
  return (
    <>
      <AppBar title={copy.privacy.appBarTitle} backHref="/" />
      <Screen width="reading" header={
          <ShellHeader
            illustration={<Illustration name="mark" size={64} alt="Lihim" />}
            title={copy.privacy.title}
            context={copy.privacy.intro}
          />
        }
      >
        <header className={cn("flex flex-col items-center gap-4 pt-2 text-center", HIDE_IN_SHELL_LG)}>
          {/* The one place the Mark carries meaning, so it's named (Accessibility). */}
          <Illustration name="mark" size={96} alt="Lihim" />
          <div className="flex flex-col gap-2">
            <h2 className="text-title text-text-1">{copy.privacy.title}</h2>
            <p className="text-body text-text-2">{copy.privacy.intro}</p>
          </div>
        </header>

        <Card className="p-0">
          <ul className="divide-y divide-border lg:grid lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {copy.privacy.rows.map((row) => (
              <li key={row.who} className="flex items-start gap-3 p-card lg:flex-col lg:p-6">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-text-1 shadow-raised">
                  <Icon icon={row.icon} />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-heading text-text-1">
                    {row.who} <span className="font-normal text-text-2">{row.sees}</span>
                  </p>
                  <p className="text-body text-text-2">{row.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Section title={copy.privacy.smallGroupTitle}>
          <SmallGroupWarning />
          <p className="text-body text-text-2">{copy.privacy.smallGroupBody}</p>
        </Section>

        <Section title={copy.privacy.limitsTitle}>
          <ul className="flex flex-col gap-card-gap">
            {copy.privacy.limits.map((limit) => (
              <li key={limit.title}>
                <Card className="flex flex-col gap-1">
                  <p className="text-heading text-text-1">{limit.title}</p>
                  <p className="text-body text-text-2">{limit.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      </Screen>
    </>
  );
}
