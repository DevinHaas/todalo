import { AttachmentError } from "@todalo/server/attachments";

export { AttachmentError, createFileTasks, listTaskAttachments, readAttachment, readUploadForm, uploadedFiles, attachmentDownload } from "@todalo/server/attachments";
export function attachmentFailure(error: unknown) {
  if (error instanceof AttachmentError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: "Attachments could not be loaded or saved. Please retry." }, { status: 503 });
}
