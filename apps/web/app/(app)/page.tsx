import Link from "next/link";
import { Button, FooterLinks, Lockup, PinnedFooter, Screen } from "@/components";
import { copy } from "@/lib/copy";
import { DesktopHome } from "./_home/desktop-home";
import { GroupList } from "./_home/group-list";

/**
 * Home (UC05). Compact/medium: lockup + group list + footer rows ("Who can see what",
 * "Settings"; R12, R14). ≥ lg: DesktopHome opens the last group (the sidebar has the list), or
 * shows the empty state with its own "Create group".
 */
export default function HomePage() {
  return (
    <>
      <Screen withFooter className="pt-6">
        <h1 className="sr-only">{copy.home.title}</h1>
        <div className="flex flex-col gap-section lg:hidden">
          <header className="flex flex-col gap-2">
            <Lockup markSize={48} tagline={copy.brand.tagline} />
          </header>
          <GroupList />
          <FooterLinks settings />
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
