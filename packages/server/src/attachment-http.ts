// Transport helpers for attachment routes (legacy Next and /api/v1). Pure: no
// database imports, so isolated QA services can use them.
import { MAX_PASTE_BYTES } from "./attachment-limits";

export class AttachmentError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
/** A parsed upload part. Not a File: Bun's File constructor rewrites text
 * types (adds ";charset=utf-8"), which would change the stored media type. */
export interface UploadedFile { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }
/** The stored row shape: content is the file's bytes in base64. */
export interface StoredAttachment { name: string; byteSize: number; content: string }

/** Reads a multipart body without trusting Content-Length: the stream is cut at
 * the batch limit (plus multipart overhead) before anything is buffered further. */
export async function readUploadForm(request: Request) {
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
  const entries = parseMultipart(Buffer.concat(chunks), request.headers.get("content-type")!);
  if (!entries) throw new AttachmentError("Files could not be read. Please paste them again.", 400);
  return {
    get: (name: string) => entries.find(entry => entry.name === name)?.value ?? null,
    getAll: (name: string) => entries.filter(entry => entry.name === name).map(entry => entry.value),
  };
}

// ponytail: own multipart/form-data parser because Bun's Request.formData()
// (1.3.9) ignores each part's Content-Type and guesses it from the file
// extension, so the uploaded media type would not be preserved. Bodies are
// bounded above. Quoted values use the WHATWG encoding browsers send (`"`, CR
// and LF as %22, %0D, %0A) and are decoded as undici does.
export function parseMultipart(body: Buffer, contentType: string): { name: string; value: string | UploadedFile }[] | null {
  const boundary = /;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (!boundary) return null;
  const delimiter = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  const next = Buffer.concat([Buffer.from("\r\n"), delimiter]);
  const decode = (value: string) => value.replace(/%22/g, "\"").replace(/%0D/gi, "\r").replace(/%0A/gi, "\n");
  const entries: { name: string; value: string | UploadedFile }[] = [];
  if (body.indexOf(delimiter) !== 0) return null;
  let start = 0;
  while (true) {
    start += delimiter.length;
    const marker = body.subarray(start, start + 2).toString();
    if (marker === "--") return entries;
    if (marker !== "\r\n") return null;
    start += 2;
    const end = body.indexOf(next, start);
    const split = body.indexOf("\r\n\r\n", start);
    if (end < 0 || split < 0 || split > end) return null;
    const headers = body.subarray(start, split).toString("utf8").split("\r\n");
    const header = (key: string) => headers.find(line => line.toLowerCase().startsWith(`${key}:`))?.slice(key.length + 1).trim();
    const disposition = header("content-disposition") ?? "";
    const name = /(?:^|;)\s*name="([^"]*)"/i.exec(disposition)?.[1];
    const filename = /(?:^|;)\s*filename="([^"]*)"/i.exec(disposition)?.[1];
    if (name === undefined || !/^form-data\s*(;|$)/i.test(disposition)) return null;
    const content = body.subarray(split + 4, end);
    const bytes = new Uint8Array(content);
    entries.push({ name: decode(name), value: filename === undefined ? content.toString("utf8") : { name: decode(filename), type: header("content-type") ?? "", size: bytes.byteLength, arrayBuffer: async () => bytes.buffer } });
    start = end + 2;
  }
}

/** The uploaded `files` entries; strings (non-file fields) are rejected. */
export function uploadedFiles(form: { getAll(name: string): unknown[] }): UploadedFile[] {
  const files = form.getAll("files");
  if (files.some(file => typeof file === "string")) throw new AttachmentError("A project and files are required.", 400);
  return files as UploadedFile[];
}

/** The stored bytes as a forced download: never rendered inline by the origin. */
export function attachmentDownload(attachment: StoredAttachment) {
  const fallback = attachment.name.replace(/[^a-zA-Z0-9._ -]/g, "_");
  const encoded = encodeURIComponent(attachment.name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(Buffer.from(attachment.content, "base64"), { headers: {
    "Content-Type": "application/octet-stream", "Content-Length": String(attachment.byteSize),
    "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
    "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
}
