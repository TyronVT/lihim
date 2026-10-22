import type { Metadata } from "next";
import { ResultsScreen } from "./_components/results-screen";

export const metadata: Metadata = { title: "Results", robots: { index: false } };

export default async function ResultsPage({ params }: { params: Promise<{ pollId: string }> }) {
  const { pollId } = await params;
  return <ResultsScreen pollId={pollId} />;
}
