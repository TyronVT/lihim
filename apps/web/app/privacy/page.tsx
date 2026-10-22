import type { Metadata } from "next";
import { AppBar, Card, Icon, Illustration, Screen, Section, SmallGroupWarning, ThemeSelect } from "@/components";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: copy.privacy.title };

/** L8 — static explainer, so a server component; ThemeSelect is the only client island. */
export default function PrivacyPage() {
  return (
    <>
      <AppBar title={copy.privacy.appBarTitle} backHref="/" />
      <Screen>
        <header className="flex flex-col items-center gap-4 pt-2 text-center">
          {/* The one place the Mark carries meaning, so it's named (Accessibility). */}
          <Illustration name="mark" size={96} alt="Lihim" />
          <div className="flex flex-col gap-2">
            <h2 className="text-title text-text-1">{copy.privacy.title}</h2>
            <p className="text-body text-text-2">{copy.privacy.intro}</p>
          </div>
        </header>

        <Card className="p-0">
          <ul className="divide-y divide-border">
            {copy.privacy.rows.map((row) => (
              <li key={row.who} className="flex items-start gap-3 p-card">
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

        <Section title={copy.privacy.displayTitle}>
          <ThemeSelect />
        </Section>
      </Screen>
    </>
  );
}
