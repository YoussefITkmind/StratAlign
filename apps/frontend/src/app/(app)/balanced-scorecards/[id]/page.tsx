import PersistedBalancedScorecardDetailPage from "@/components/scorecards/PersistedBalancedScorecardDetailPage";
import ScorecardSyncWorkspace from "@/components/scorecards/ScorecardSyncWorkspace";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <PersistedBalancedScorecardDetailPage scorecardId={id} />
      <ScorecardSyncWorkspace scorecardId={id} />
    </>
  );
}
