import PersistedBalancedScorecardDetailPage from "@/components/scorecards/PersistedBalancedScorecardDetailPage";
import ScorecardSyncWorkspace from "@/components/scorecards/ScorecardSyncWorkspace";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <ScorecardSyncWorkspace scorecardId={id} />
      <PersistedBalancedScorecardDetailPage scorecardId={id} />
    </>
  );
}
