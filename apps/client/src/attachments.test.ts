import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { attachmentKeys, attachmentMutations, attachmentTransport, browserAttachmentTransport, type AttachmentTransport } from "./attachments";
import { ProjectFiles, TaskAttachments } from "./attachment-views";
import { AccountTransportError, nativeAccountError } from "./errors";
import { projectKeys } from "./projects";
import { taskKeys } from "./tasks";

const native = vi.hoisted(() => ({ tauri: false, calls: [] as unknown[][], result: null as unknown }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => native.tauri,
  invoke: async (...args: unknown[]) => { native.calls.push(args); return native.result; },
}));

const file = (content: string, name = "notes.txt", type = "text/plain") => new File([content], name, { type });
const doc = { id: "a1", name: "scan (1).pdf", mediaType: "application/pdf", byteSize: 2048 };

describe("browser attachment transport", () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const respond = (status: number, body?: unknown) => (async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;

  it("uploads multipart files to the encoded project path with the cookie session", async () => {
    calls.length = 0;
    const tasks = [{ id: "t1", title: "notes.txt" }];
    expect(await browserAttachmentTransport(respond(201, { tasks })).upload("a/b", [file("hi")])).toEqual(tasks);
    expect(calls[0].path).toBe("/api/v1/projects/a%2Fb/files");
    expect(calls[0].init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect((calls[0].init!.body as FormData).getAll("files").map(entry => (entry as File).name)).toEqual(["notes.txt"]);
  });

  it("lists by task, links downloads same-origin and maps missing to null", async () => {
    const transport = browserAttachmentTransport(respond(200, { attachments: [doc] }));
    expect(await transport.list("t 1")).toEqual([doc]);
    expect(calls.at(-1)!.path).toBe("/api/v1/tasks/t%201/attachments");
    expect(transport.href!("a/1")).toBe("/api/v1/attachments/a%2F1");
    expect(transport.save).toBeUndefined();
    expect(await browserAttachmentTransport(respond(404)).list("x")).toBeNull();
    expect(await browserAttachmentTransport(respond(404)).upload("x", [file("x")])).toBeNull();
  });

  it("maps failures to safe codes", async () => {
    for (const [status, code] of [[401, "UNAUTHENTICATED"], [400, "INVALID_INPUT"], [413, "FILES_TOO_LARGE"], [403, "SAVE_FAILED"], [500, "SAVE_FAILED"]] as const) {
      await expect(browserAttachmentTransport(respond(status)).upload("p", [file("x")])).rejects.toMatchObject({ code });
    }
    await expect(browserAttachmentTransport(respond(500)).list("t")).rejects.toMatchObject({ code: "TASKS_UNAVAILABLE" });
    const offline = (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
    await expect(browserAttachmentTransport(offline).upload("p", [file("x")])).rejects.toMatchObject({ code: "CONNECTION_FAILED" });
  });
});

describe("native attachment transport", () => {
  it("sends the bytes as one raw IPC body with header-safe metadata and fixed commands", async () => {
    native.tauri = true; native.calls.length = 0;
    const transport = attachmentTransport();
    native.result = { tasks: [{ id: "t1", title: "über.txt" }, { id: "t2", title: "b.bin" }] };
    expect(await transport.upload("work", [file("hi", "über.txt"), file("\u0000!", "b.bin", "")])).toHaveLength(2);
    const [command, body, options] = native.calls[0] as [string, Uint8Array, { headers: Record<string, string> }];
    expect(command).toBe("upload_files");
    expect([...body]).toEqual([104, 105, 0, 33]);
    expect(options.headers["x-todalo-project"]).toBe("work");
    expect(options.headers["x-todalo-files"]).toMatch(/^[\x20-\x7e]+$/);
    expect(JSON.parse(options.headers["x-todalo-files"])).toEqual([{ name: "über.txt", type: "text/plain", size: 2 }, { name: "b.bin", type: "", size: 2 }]);
    native.result = null;
    expect(await transport.list("t1")).toBeNull();
    expect(native.calls[1]).toEqual(["attachments", { id: "t1" }, undefined]);
    native.result = { name: "scan (1).pdf", location: "Downloads" };
    expect(await transport.save!(doc)).toEqual({ name: "scan (1).pdf", location: "Downloads" });
    expect(native.calls[2]).toEqual(["save_attachment", { id: "a1", name: "scan (1).pdf" }, undefined]);
    expect(transport.href).toBeUndefined();
    native.tauri = false;
  });

  it("recognizes the Rust attachment errors", () => {
    expect(nativeAccountError("A paste batch must be at most 10 MB.").code).toBe("FILES_TOO_LARGE");
    expect(nativeAccountError("The file could not be downloaded. Try again.").code).toBe("DOWNLOAD_FAILED");
    expect(nativeAccountError("The file could not be saved on this device. Try again.").code).toBe("FILE_SAVE_FAILED");
  });
});

describe("attachment cache and uploads", () => {
  const transport = (tasks: { id: string; title: string }[] | null): AttachmentTransport & { uploads: number } => {
    const result = { uploads: 0, upload: async () => { result.uploads += 1; return tasks; }, list: async () => [] };
    return result;
  };

  it("nests attachments under the user's task key", () => {
    expect(attachmentKeys.task("u1", "t1").slice(0, 4)).toEqual([...taskKeys.task("u1", "t1")]);
  });

  it("checks the legacy limits before sending and refreshes only the project", async () => {
    const cache = new QueryClient();
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    const ok = transport([{ id: "t1", title: "notes.txt" }]);
    await expect(attachmentMutations(ok, cache, "u1").upload("work", [file("")])).rejects.toThrow("Files must contain content and be at most 5 MB each.");
    await expect(attachmentMutations(ok, cache, "u1").upload("work", [file("x", "a/b.txt")])).rejects.toThrow("File names must be 1–255 characters without control characters or paths.");
    expect(ok.uploads).toBe(0);
    expect(await attachmentMutations(ok, cache, "u1").upload("work", [file("x")])).toHaveLength(1);
    expect(invalidate.mock.calls).toEqual([[{ queryKey: projectKeys.detail("u1", "work") }]]);
    await expect(attachmentMutations(transport(null), cache, "u1").upload("gone", [file("x")])).rejects.toEqual(new AccountTransportError("PROJECT_NOT_FOUND"));
  });
});

describe("attachment views", () => {
  const render = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(node);
  const success = <T,>(data: T) => ({ status: "success" as const, data, error: null });

  it("offers a labelled multi-file picker with the legacy limit hint", () => {
    const html = render(createElement(ProjectFiles, { upload: async () => [] }));
    expect(html).toContain('type="file"');
    expect(html).toContain("multiple");
    expect(html).toContain("Add files");
    expect(html).toContain("Up to 5 files, 5 MB each and 10 MB per paste.");
  });

  it("renders attachment loading, error, empty and both download styles", () => {
    const view = (props: Partial<Parameters<typeof TaskAttachments>[0]>) => render(createElement(TaskAttachments, { state: success([doc]), onRetry: () => {}, ...props }));
    expect(view({ state: { status: "pending", error: null } })).toContain("Loading attachments…");
    expect(view({ state: { status: "error", error: new Error("Your tasks could not be loaded. Try again.") } })).toContain("Try again");
    expect(view({ state: success([]) })).toContain("No attachments");
    const link = view({ href: id => `/api/v1/attachments/${id}` });
    expect(link).toContain('href="/api/v1/attachments/a1"');
    expect(link).toContain('download="scan (1).pdf"');
    expect(link).toContain("(2 KB)");
    const button = view({ onSave: () => {}, saving: { pending: false, saved: { name: "scan (1).pdf", location: "Downloads" }, error: null } });
    expect(button).not.toContain("href=");
    expect(button).toContain("Saved scan (1).pdf to Downloads.");
    expect(view({ onSave: () => {}, saving: { pending: false, saved: null, error: "The file could not be downloaded. Try again." } })).toContain('role="alert"');
  });
});
