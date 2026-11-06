import { requireUserId } from "@/lib/auth";
import { attachmentDownload, attachmentFailure, readAttachment } from "@/lib/attachments";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return Response.json({ error: "Sign in to download files." }, { status: 401 }); }
  try { return attachmentDownload(await readAttachment(userId, (await params).id)); }
  catch (error) { return attachmentFailure(error); }
}
