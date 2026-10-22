import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { Showcase } from "./showcase";

export const metadata: Metadata = { title: "Components", robots: { index: false } };

/** Visual QA for every component/state. Hidden in production unless NEXT_PUBLIC_ENABLE_DEV_ROUTES=1. */
export default function DevComponentsPage() {
  if (!env.devRoutes) notFound();
  return <Showcase />;
}
