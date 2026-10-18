import { EditorWorkspace } from "@/components/editor/EditorWorkspace";

export default async function EditorPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <EditorWorkspace projectId={projectId} />;
}
