import { afterAll, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import { clientFile } from "./client-files";

// Vitest runs on Node: Bun.file as far as clientFile uses it (a typed Blob that knows if it exists).
const types: Record<string, string> = { js: "text/javascript;charset=utf-8", html: "text/html;charset=utf-8" };
vi.stubGlobal("Bun", {
  file: (path: string) => Object.assign(
    new Blob(existsSync(path) ? [readFileSync(path)] : [], { type: types[path.split(".").pop()!] ?? "application/octet-stream" }),
    { exists: async () => existsSync(path) },
  ),
});

const dist = mkdtempSync(join(tmpdir(), "client-files-"));
mkdirSync(join(dist, "assets"));
writeFileSync(join(dist, "index.html"), "<!doctype html>");
writeFileSync(join(dist, "assets/app-1.js"), "console.log(1)");
writeFileSync(join(dist, "assets/app-1.js.br"), brotliCompressSync("console.log(1)"));
writeFileSync(join(dist, "assets/plain-2.js"), "console.log(2)");
afterAll(() => rmSync(dist, { recursive: true }));

describe("clientFile", () => {
  it("serves a hashed asset's brotli copy to clients that take br, the file to others", async () => {
    const br = await clientFile(dist, "/assets/app-1.js", "gzip, br");
    expect(br?.headers.get("content-encoding")).toBe("br");
    expect(br?.headers.get("content-type")).toContain("javascript");
    expect(br?.headers.get("cache-control")).toContain("immutable");
    expect(br?.headers.get("vary")).toBe("accept-encoding");
    expect(brotliDecompressSync(Buffer.from(await br!.arrayBuffer())).toString()).toBe("console.log(1)");

    const plain = await clientFile(dist, "/assets/app-1.js", "gzip");
    expect(plain?.headers.get("content-encoding")).toBeNull();
    expect(await plain?.text()).toBe("console.log(1)");
    expect((await clientFile(dist, "/assets/plain-2.js", "br"))?.headers.get("content-encoding")).toBeNull();
  });

  it("answers app routes with index.html and a missing asset with nothing", async () => {
    const page = await clientFile(dist, "/today", "br");
    expect(await page?.text()).toBe("<!doctype html>");
    expect(page?.headers.get("cache-control")).toBe("no-cache");
    expect(await clientFile(dist, "/assets/gone-3.js", "br")).toBeNull();
  });
});
