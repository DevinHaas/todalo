// Goals ticket 29: the text the Coach reads from an uploaded document, read
// once on the server: text as UTF-8, a docx's paragraphs (its zip read here),
// a PDF's text (unpdf, loaded on first use). Images keep none.
import { DOCUMENT_TEXT_LIMIT, type CoachDocumentKind } from "./coach-documents";

/** A docx whose text part inflates beyond this is refused (zip bomb). */
const MAX_INFLATED_BYTES = 50 * 1024 * 1024;

/** The text the Coach reads from a file; null for images or when nothing could be read. */
export async function extractText(kind: CoachDocumentKind, bytes: Uint8Array): Promise<string | null> {
  let text: string | null = null;
  try {
    if (kind === "text") text = new TextDecoder().decode(bytes);
    else if (kind === "docx") { const xml = await unzipEntry(bytes, "word/document.xml"); text = xml && docxText(new TextDecoder().decode(xml)); }
    else if (kind === "pdf") {
      // Loaded on first use: pdf.js is large and only PDFs need it.
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      text = (await pdfText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: true })).text;
    }
  } catch { return null; }
  const clean = text?.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, DOCUMENT_TEXT_LIMIT);
  return clean || null;
}

/** A docx's paragraphs as lines: the w:t runs, tabs and breaks of word/document.xml. */
export function docxText(xml: string) {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
  return xml.replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>|<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (whole, code: string) => code[0] === "#"
      ? String.fromCodePoint(parseInt(code.slice(code[1] === "x" ? 2 : 1), code[1] === "x" ? 16 : 10)) : entities[code] ?? whole);
}

/**
 * One entry of a zip (a docx is one): the central directory gives its local
 * header; stored or deflated (DecompressionStream, no zip dependency).
 */
export async function unzipEntry(bytes: Uint8Array, wanted: string): Promise<Uint8Array | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65_557); at--) if (view.getUint32(at, true) === 0x06054b50) { end = at; break; }
  if (end < 0) return null;
  let offset = view.getUint32(end + 16, true);
  for (let n = view.getUint16(end + 10, true); n > 0 && offset + 46 <= bytes.length; n--) {
    if (view.getUint32(offset, true) !== 0x02014b50) return null;
    const method = view.getUint16(offset + 10, true), size = view.getUint32(offset + 20, true), inflated = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), skip = nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    if (new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)) === wanted) {
      if (inflated > MAX_INFLATED_BYTES || local + 30 > bytes.length) return null;
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      if (method === 0) return data;
      if (method !== 8) return null;
      return new Uint8Array(await new Response(new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    }
    offset += 46 + skip;
  }
  return null;
}

