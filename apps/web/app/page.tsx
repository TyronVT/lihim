import Link from "next/link";
import { Button, Lockup, PinnedFooter, Screen } from "@/components";
import { copy } from "@/lib/copy";
import { GroupList } from "./_home/group-list";

export default function HomePage() {
  return (
    <>
      <Screen withFooter className="pt-6">
        <header className="flex flex-col gap-2">
          <h1 className="sr-only">{copy.brand.name}</h1>
          <Lockup markSize={48} tagline={copy.brand.tagline} />
        </header>
        <GroupList />
      </Screen>
      <PinnedFooter>
        <Button asChild>
          <Link href="/groups/new">{copy.group.create}</Link>
        </Button>
      </PinnedFooter>
    </>
  );
}
