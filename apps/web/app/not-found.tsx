import Link from "next/link";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Screen } from "@/components/screen";
import { copy } from "@/lib/copy";

export default function NotFound() {
  return (
    <Screen className="pt-14">
      <EmptyState
        illustration="mark"
        title={copy.errors.notFound}
        action={
          <Button asChild variant="secondary">
            <Link href="/">{copy.home.title}</Link>
          </Button>
        }
      />
    </Screen>
  );
}
