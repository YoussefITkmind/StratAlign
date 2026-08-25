import PersistedBalancedScorecardDetailPage from "@/components/scorecards/PersistedBalancedScorecardDetailPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PersistedBalancedScorecardDetailPage scorecardId={id} />;
}
