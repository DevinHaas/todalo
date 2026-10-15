import { requireUserId } from "@/lib/auth";
import { AttachmentError, attachmentFailure, createFileTasks, readUploadForm, uploadedFiles } from "@/lib/attachments";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return Response.json({ error: "Sign in to paste files." }, { status: 401 }); }
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AttachmentError("This upload must come from Todalo.", 403);
    const form = await readUploadForm(request);
    const projectId = form.get("projectId"); const files = uploadedFiles(form);
    if (typeof projectId !== "string" || !projectId || projectId.length > 200) throw new AttachmentError("A project and files are required.", 400);
    const tasks = await createFileTasks(userId, projectId, files);
    revalidatePath("/", "layout");
    return Response.json({ tasks }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return attachmentFailure(error); }
}
