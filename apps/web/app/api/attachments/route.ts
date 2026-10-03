import { requireUserId } from "@/lib/auth";
import { AttachmentError, attachmentFailure, createFileTasks } from "@/lib/attachments";
import { MAX_PASTE_BYTES } from "@/lib/attachment-limits";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return Response.json({ error: "Sign in to paste files." }, { status: 401 }); }
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AttachmentError("This upload must come from Todalo.", 403);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new AttachmentError("Paste files using a multipart upload.", 400);
    const limit = MAX_PASTE_BYTES + 64 * 1024;
    if (Number(request.headers.get("content-length")) > limit) throw new AttachmentError("A paste batch must be at most 10 MB.", 413);
    const reader = request.body?.getReader();
    if (!reader) throw new AttachmentError("No files were supplied.", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new AttachmentError("A paste batch must be at most 10 MB.", 413); }
      chunks.push(value);
    }
    let form: FormData;
    try { form = await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type")! } }).formData(); }
    catch { throw new AttachmentError("Files could not be read. Please paste them again.", 400); }
    const projectId = form.get("projectId"); const files = form.getAll("files");
    if (typeof projectId !== "string" || !projectId || projectId.length > 200 || files.some(file => typeof file === "string")) throw new AttachmentError("A project and files are required.", 400);
    const tasks = await createFileTasks(userId, projectId, files as File[]);
    revalidatePath("/", "layout");
    return Response.json({ tasks }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return attachmentFailure(error); }
}
