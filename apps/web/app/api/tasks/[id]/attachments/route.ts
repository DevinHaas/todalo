import { requireUserId } from "@/lib/auth";
import { attachmentFailure, listTaskAttachments } from "@/lib/attachments";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return Response.json({ error: "Sign in to view files." }, { status: 401 }); }
  try { return Response.json(await listTaskAttachments(userId, (await params).id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return attachmentFailure(error); }
}
