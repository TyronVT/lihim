import Link from "next/link";
import { Button, Lockup, PinnedFooter, Screen } from "@/components";
import { copy } from "@/lib/copy";
import { DesktopHome } from "./_home/desktop-home";
import { GroupList } from "./_home/group-list";

/** Home. Compact/medium: lockup + group list. ≥ lg: DesktopHome opens the last group (sidebar has the list). */
export default function HomePage() {
  return (
    <>
      <Screen withFooter className="pt-6">
        <h1 className="sr-only">{copy.brand.name}</h1>
        <div className="flex flex-col gap-section lg:hidden">
          <header className="flex flex-col gap-2">
            <Lockup markSize={48} tagline={copy.brand.tagline} />
          </header>
          <GroupList />
        </div>
        <DesktopHome />
      </Screen>
      <PinnedFooter>
        <Button asChild>
          <Link href="/groups/new">{copy.group.create}</Link>
        </Button>
      </PinnedFooter>
    </>
  );
}
