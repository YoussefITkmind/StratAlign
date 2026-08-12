import EditableMapCanvas from "@/components/strategy-map/EditableMapCanvas";
import { getCurrentAuthorization } from "@/services/iam.service";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authorization = await getCurrentAuthorization();
  return <EditableMapCanvas scorecardId={id} roles={authorization?.roles ?? []} />;
}
