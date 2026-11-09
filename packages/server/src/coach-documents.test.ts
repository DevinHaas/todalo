import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DOCUMENT_FACT_LIMIT, acceptsImages, documentFacts, documentKind, documentProblem, type CoachDocumentRecord } from "./coach-documents";
import { extractText } from "./coach-documents-text";

/** A zip with deflated entries (what a .docx is). */
function zip(entries: Record<string, string>) {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = deflateRawSync(Buffer.from(text)), file = Buffer.from(name);
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(8, 8); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(text.length, 22); head.writeUInt16LE(file.length, 26);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(8, 10); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(text.length, 24); entry.writeUInt16LE(file.length, 28); entry.writeUInt32LE(offset, 42);
    local.push(head, file, data); central.push(entry, file);
    offset += 30 + file.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, directory, end]));
}
const docx = (paragraphs: string[]) => zip({
  "[Content_Types].xml": "<Types/>",
  "word/document.xml": `<w:document><w:body>${paragraphs.map(text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`,
});
/** A one-page PDF showing `text` (xref offsets computed). */
function pdf(text: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${`BT /F1 12 Tf 20 100 Td (${text}) Tj ET`.length} >>\nstream\nBT /F1 12 Tf 20 100 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => { const at = body.length; body += `${index + 1} 0 obj\n${object}\nendobj\n`; return at; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(at => `${String(at).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}

describe("documentKind", () => {
  it.each([
    ["syllabus.pdf", "", "pdf", "application/pdf"],
    ["notes.md", "", "text", "text/markdown"],
    ["notes.txt", "text/plain", "text", "text/plain"],
    ["brief.docx", "", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["photo.JPG", "", "image", "image/jpeg"],
    ["screen", "image/png", "image", "image/png"],
  ])("%s (%s) is %s", (name, type, kind, mediaType) => expect(documentKind(name, type)).toEqual({ kind, mediaType }));
  it.each([["app.exe", "application/octet-stream"], ["sheet.xlsx", ""], ["vector.svg", "image/svg+xml"]])("refuses %s", (name, type) => expect(documentKind(name, type)).toBeNull());
});

describe("documentProblem", () => {
  const file = (name: string, size = 10, type = "") => ({ name, size, type });
  it("uses the task attachment limits, the accepted kinds and the session cap", () => {
    expect(documentProblem([file("a.pdf")], 0)).toBeNull();
    expect(documentProblem([file("a.pdf", 6 * 1024 * 1024)], 0)).toMatch(/5 MB/);
    expect(documentProblem([file("a.exe")], 0)).toMatch(/PDF, Word/);
    expect(documentProblem([file("a.pdf"), file("b.pdf")], 9)).toMatch(/at most 10/);
  });
});

describe("extractText", () => {
  it("reads text, docx paragraphs (entities decoded) and PDF text; images have none", async () => {
    expect(await extractText("text", new TextEncoder().encode("Week 1: read ch. 1\n\n\n\nWeek 2"))).toBe("Week 1: read ch. 1\n\nWeek 2");
    expect(await extractText("docx", docx(["Essay &amp; outline", "Due Friday"]))).toBe("Essay & outline\nDue Friday");
    expect(await extractText("pdf", pdf("Midterm on March 3"))).toContain("Midterm on March 3");
    expect(await extractText("image", new Uint8Array([1, 2]))).toBeNull();
  });
  it("gives null for unreadable files instead of failing", async () => {
    expect(await extractText("docx", new Uint8Array([1, 2, 3]))).toBeNull();
    expect(await extractText("pdf", new TextEncoder().encode("not a pdf"))).toBeNull();
  });
});

describe("documentFacts", () => {
  const record = (name: string, text: string | null, mediaType = "text/plain"): CoachDocumentRecord => ({ id: name, name, mediaType, byteSize: 1, content: "", text, createdAt: new Date() });
  it("numbers documents, cuts long text and says what an image is to this model", () => {
    const facts = documentFacts([record("a.txt", "x".repeat(DOCUMENT_FACT_LIMIT + 5)), record("b.png", null, "image/png"), record("c.pdf", null, "application/pdf")], false);
    expect(facts[0]).toMatchObject({ ref: "d1", kind: "text", note: "text cut short" });
    expect((facts[0] as { text: string }).text).toHaveLength(DOCUMENT_FACT_LIMIT);
    expect(facts[1]).toEqual({ ref: "d2", name: "b.png", kind: "image", note: "an image this model cannot see; only its name is known" });
    expect(facts[2]).toMatchObject({ ref: "d3", text: "", note: "no text could be read from this file" });
    expect(documentFacts([record("b.png", null, "image/png")], true)[0]!.note).toMatch(/attached as an image/);
  });
  it("sends images only to providers whose models read them", () => {
    expect(["openai", "anthropic", "chatgpt", "openrouter", "ollama"].map(provider => acceptsImages({ provider: provider as never }))).toEqual([true, true, true, false, false]);
  });
});
