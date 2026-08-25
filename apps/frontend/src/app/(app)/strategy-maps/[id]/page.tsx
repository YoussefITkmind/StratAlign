import ConnectedStrategyMapCanvas from "@/components/strategy-map/ConnectedStrategyMapCanvas";
import StrategyMapSelector from "@/components/strategy-map/StrategyMapSelector";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="relative">
      <StrategyMapSelector scorecardId={id} />
      <ConnectedStrategyMapCanvas scorecardId={id} />
    </div>
  );
}
