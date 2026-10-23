import Link from "next/link";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Screen } from "@/components/screen";
import { copy } from "@/lib/copy";
import { APP_HOME } from "@/lib/routes";

export default function NotFound() {
  return (
    <Screen className="pt-14">
      <EmptyState
        illustration="mark"
        title={copy.errors.notFound}
        action={
          <Button asChild variant="secondary">
            <Link href={APP_HOME}>{copy.home.title}</Link>
          </Button>
        }
      />
    </Screen>
  );
}
