import PersistedBalancedScorecardDetailPage from "@/components/scorecards/PersistedBalancedScorecardDetailPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="[&>div]:flex [&>div]:flex-col [&>div>main]:order-3 [&>div>section]:order-4 [&>div>section]:!mt-0">
      <PersistedBalancedScorecardDetailPage scorecardId={id} />
    </div>
  );
}
