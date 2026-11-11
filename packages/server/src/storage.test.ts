import { afterEach, describe, expect, it, vi } from "vitest";
import { fileContent, storeFile } from "./storage";

const bytes = new Uint8Array([104, 105, 0, 255]);
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("attachment storage", () => {
  it("keeps base64 in the row while R2 is not configured", async () => {
    const content = await storeFile(bytes);
    expect(content).toBe(Buffer.from(bytes).toString("base64"));
    expect(await fileContent(content)).toBe(content);
  });

  it("puts the bytes in the bucket with a signed request and keeps only a reference", async () => {
    vi.stubEnv("R2_ENDPOINT", "https://acct.eu.r2.cloudflarestorage.com/");
    vi.stubEnv("R2_BUCKET", "todalo-files");
    vi.stubEnv("R2_ACCESS_KEY_ID", "key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    const objects = new Map<string, Uint8Array<ArrayBuffer>>();
    vi.stubGlobal("fetch", vi.fn(async (input: Request) => {
      expect(input.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=key\//);
      if (input.method === "PUT") { objects.set(input.url, new Uint8Array(await input.arrayBuffer())); return new Response(null, { status: 200 }); }
      const stored = objects.get(input.url);
      return stored ? new Response(stored) : new Response(null, { status: 404 });
    }));

    const content = await storeFile(bytes);
    expect(content).toMatch(/^r2:attachments\/[0-9a-f-]{36}$/);
    expect([...objects.keys()][0]).toBe(`https://acct.eu.r2.cloudflarestorage.com/todalo-files/${content.slice(3)}`);
    expect(await fileContent(content)).toBe(Buffer.from(bytes).toString("base64"));
    // an older row with base64 content is still read from the row
    expect(await fileContent("aGk=")).toBe("aGk=");
    await expect(fileContent("r2:attachments/missing")).rejects.toThrow("could not be read (404)");
  });
});
