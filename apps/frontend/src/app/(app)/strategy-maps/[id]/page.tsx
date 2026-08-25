import StrategyMapCanvas from "@/components/strategy-map/StrategyMapCanvas";
import StrategyMapSelector from "@/components/strategy-map/StrategyMapSelector";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <StrategyMapSelector scorecardId={id} />
      <StrategyMapCanvas scorecardId={id} />
    </>
  );
}
