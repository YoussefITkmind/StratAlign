import EditableMapCanvas from "@/components/strategy-map/EditableMapCanvas";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditableMapCanvas mapId={id} />;
}
