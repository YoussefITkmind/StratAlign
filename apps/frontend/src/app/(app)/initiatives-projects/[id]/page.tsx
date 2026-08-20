import { InitiativeDetailPage } from "@/components/initiatives/InitiativeDetailPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InitiativeDetailPage id={id} />;
}
