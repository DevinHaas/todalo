// Goals ticket 29: documents attached to the Coach chat (the session). Pure
// and client-safe (no database, no PDF reader): which files are accepted and
// what the model sees; the text is read on upload (coach-documents-text.ts).
// The bytes are stored like task attachments (base64) and copied to a task
// only when an "attach" draft item is accepted.
import { validateAttachmentFiles } from "./attachment-limits";
import type { UploadedFile } from "./attachment-http";
import type { CoachConfig } from "./coach";

export type CoachDocumentKind = "pdf" | "docx" | "text" | "image";
/** GET/POST/DELETE answers carry the session's documents; content stays on the server. */
export interface CoachDocumentDto { id: string; name: string; mediaType: string; byteSize: number; kind: CoachDocumentKind }
export interface CoachDocumentsDto { documents: CoachDocumentDto[] }
export interface CoachDocumentRecord { id: string; name: string; mediaType: string; byteSize: number; content: string; text: string | null; createdAt: Date }
export type NewCoachDocument = Omit<CoachDocumentRecord, "id" | "createdAt">;

/** At most this many documents in one session (each upload batch has the task attachment limits). */
export const MAX_COACH_DOCUMENTS = 10;
/** Extracted text kept per document, and sent to the model per document and in all. */
export const DOCUMENT_TEXT_LIMIT = 100_000;
export const DOCUMENT_FACT_LIMIT = 12_000;
export const DOCUMENTS_FACT_LIMIT = 30_000;

const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const images: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
const texts: Record<string, string> = { txt: "text/plain", md: "text/markdown", markdown: "text/markdown", csv: "text/csv" };

/** The file's kind and the media type stored (browsers often send "" for .md), or null when not accepted. */
export function documentKind(name: string, type: string): { kind: CoachDocumentKind; mediaType: string } | null {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  const media = type.split(";")[0]!.trim().toLowerCase();
  if (media === "application/pdf" || extension === "pdf") return { kind: "pdf", mediaType: "application/pdf" };
  if (media === docx || extension === "docx") return { kind: "docx", mediaType: docx };
  if (Object.values(images).includes(media)) return { kind: "image", mediaType: media };
  if (images[extension] && !media) return { kind: "image", mediaType: images[extension] };
  if (media.startsWith("text/")) return { kind: "text", mediaType: media };
  if (texts[extension]) return { kind: "text", mediaType: texts[extension] };
  return null;
}
export const kindOf = (document: Pick<CoachDocumentRecord, "name" | "mediaType">): CoachDocumentKind => documentKind(document.name, document.mediaType)?.kind ?? "text";

export const toCoachDocumentDto = (document: CoachDocumentRecord): CoachDocumentDto =>
  ({ id: document.id, name: document.name, mediaType: document.mediaType, byteSize: document.byteSize, kind: kindOf(document) });

/** Why an upload is refused (the task attachment limits, the accepted kinds, the session cap), or null. */
export function documentProblem(files: readonly Pick<UploadedFile, "name" | "size" | "type">[], existing: number): string | null {
  try { validateAttachmentFiles(files); } catch (error) { return (error as Error).message; }
  if (files.some(file => !documentKind(file.name, file.type))) return "Attach PDF, Word (.docx), text, Markdown or image files.";
  if (existing + files.length > MAX_COACH_DOCUMENTS) return `The Coach keeps at most ${MAX_COACH_DOCUMENTS} documents in a conversation.`;
  return null;
}

/**
 * Whether the provider's model reads images. ponytail: by provider (OpenAI,
 * Anthropic and ChatGPT models do); OpenRouter and Ollama models vary, so they
 * get the extracted text only. A per-model capability list goes here if needed.
 */
export const acceptsImages = (config: Pick<CoachConfig, "provider">) => ["openai", "anthropic", "chatgpt"].includes(config.provider);

/** The documents as the model sees them ("d1"…): names and extracted text within the limits; images say whether they are attached. */
export function documentFacts(documents: readonly CoachDocumentRecord[], images: boolean) {
  let left = DOCUMENTS_FACT_LIMIT;
  return documents.map((document, index) => {
    const kind = kindOf(document);
    const text = (document.text ?? "").slice(0, Math.min(DOCUMENT_FACT_LIMIT, left));
    left -= text.length;
    return {
      ref: `d${index + 1}`, name: document.name.slice(0, 255), kind,
      ...(kind === "image" ? { note: images ? "attached as an image to the user's message" : "an image this model cannot see; only its name is known" }
        : { text, ...(!document.text && { note: "no text could be read from this file" }), ...(document.text && text.length < document.text.length && { note: "text cut short" }) }),
    };
  });
}
