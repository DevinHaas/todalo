import { describe, expect, it } from "vitest";
import { parseMultipart, type UploadedFile } from "./attachment-http";

const part = (headers: string, content: string | Uint8Array) => Buffer.concat([Buffer.from(`--XB\r\n${headers}\r\n\r\n`), Buffer.from(content), Buffer.from("\r\n")]);
const body = (...parts: Buffer[]) => Buffer.concat([...parts, Buffer.from("--XB--\r\n")]);

describe("multipart parser", () => {
  it("keeps each part's declared type, exact bytes and WHATWG-encoded UTF-8 names", async () => {
    const bytes = new Uint8Array([0, 13, 10, 45, 45, 88, 255]);
    const entries = parseMultipart(body(
      part('Content-Disposition: form-data; name="projectId"', "work"),
      part('Content-Disposition: form-data; name="files"; filename="a%22b über.png"\r\nContent-Type: application/pdf', bytes),
      part('Content-Disposition: form-data; name="files"; filename="raw"', "x"),
    ), 'multipart/form-data; boundary="XB"')!;
    expect(entries.map(entry => entry.name)).toEqual(["projectId", "files", "files"]);
    expect(entries[0].value).toBe("work");
    const [, file, untyped] = entries.map(entry => entry.value as UploadedFile);
    expect([file.name, file.type, [...new Uint8Array(await file.arrayBuffer())]]).toEqual(['a"b über.png', "application/pdf", [...bytes]]);
    expect([untyped.name, untyped.type]).toEqual(["raw", ""]);
  });

  it("rejects bodies that are not well-formed form data", () => {
    const valid = part('Content-Disposition: form-data; name="files"; filename="a.txt"', "x");
    for (const [content, type] of [
      [body(valid), "multipart/form-data"],
      [Buffer.concat([Buffer.from("junk"), body(valid)]), "multipart/form-data; boundary=XB"],
      [valid, "multipart/form-data; boundary=XB"],
      [body(part('Content-Disposition: attachment; name="files"', "x")), "multipart/form-data; boundary=XB"],
      [body(part("Content-Type: text/plain", "x")), "multipart/form-data; boundary=XB"],
    ] as const) expect(parseMultipart(content, type)).toBeNull();
  });
});
