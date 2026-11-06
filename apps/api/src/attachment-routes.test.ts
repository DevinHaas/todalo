import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFileTasks, listTaskAttachments, readAttachment } from "@todalo/server/attachments";
import { createAttachmentRoutes } from "./attachment-routes";

// The real shared operations run over an in-memory relational boundary, so
// ownership, limits and storage are the production code paths.
const boundary = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@todalo/db", async () => {
  const { relationalBoundary } = await import("../../web/lib/testing/relational-boundary");
  const { db } = await relationalBoundary(boundary);
  return { db: { ...db, batch: (queries: PromiseLike<unknown>[]) => Promise.all(queries) } };
});

const legacyBytes = new Uint8Array([0, 255, 128, 10, 13]);
beforeEach(() => {
  boundary.rows = {
    projects: [{ id: "work", userId: "alice", name: "Work" }, { id: "private", userId: "bob", name: "Private" }],
    tasks: [{ id: "legacy-task", userId: "alice", projectId: "work", title: "scan.pdf" }, { id: "bob-task", userId: "bob", projectId: "private", title: "secret.txt" }],
    // Rows written by the legacy Next paste route before this API existed.
    task_attachments: [
      { id: "legacy", userId: "alice", taskId: "legacy-task", name: "scan (1).pdf", mediaType: "application/pdf", byteSize: legacyBytes.length, content: Buffer.from(legacyBytes).toString("base64"), createdAt: new Date() },
      { id: "bob-file", userId: "bob", taskId: "bob-task", name: "secret.txt", mediaType: "text/plain", byteSize: 6, content: Buffer.from("secret").toString("base64"), createdAt: new Date() },
    ],
  };
});

const app = createAttachmentRoutes({
  verify: async (headers) => headers.get("authorization")?.replace("Bearer ", "") ?? headers.get("cookie")?.replace("session=", "") ?? null,
  allowedOrigins: new Set(["http://localhost:5173"]),
  createFileTasks, list: listTaskAttachments, read: readAttachment,
});
type Auth = { user?: string; cookie?: string; origin?: string };
const headersFor = (auth: Auth) => {
  const headers = new Headers();
  if (auth.user) headers.set("authorization", `Bearer ${auth.user}`);
  if (auth.cookie) headers.set("cookie", `session=${auth.cookie}`);
  if (auth.origin) headers.set("origin", auth.origin);
  return headers;
};
const get = (path: string, auth: Auth = { user: "alice" }) => app.handle(new Request(`http://localhost/api/v1${path}`, { headers: headersFor(auth) }));
const upload = (files: File[], auth: Auth = { user: "alice" }, project = "work") => {
  const body = new FormData(); files.forEach(file => body.append("files", file));
  return app.handle(new Request(`http://localhost/api/v1/projects/${project}/files`, { method: "POST", headers: headersFor(auth), body }));
};
const file = (content: ConstructorParameters<typeof File>[0][number], name = "notes.txt", type = "text/plain") => new File([content], name, { type });
const stored = () => boundary.rows.task_attachments.length;

describe("attachment API", () => {
  it("requires a session on upload, list and download", async () => {
    expect((await upload([file("x")], { origin: "http://localhost:5173" })).status).toBe(401);
    expect(await (await get("/tasks/legacy-task/attachments", {})).json()).toEqual({ code: "UNAUTHENTICATED", message: "Please sign in again." });
    expect((await get("/attachments/legacy", {})).status).toBe(401);
  });

  it("creates one owned task per file and returns the exact stored bytes", async () => {
    const response = await upload([file(new Uint8Array([0, 1, 254, 255]), "über's.bin", "application/octet-stream"), file("second", "two.txt")]);
    expect(response.status).toBe(201);
    const { tasks } = await response.json() as { tasks: { id: string; title: string }[] };
    expect(tasks.map(task => task.title)).toEqual(["über's.bin", "two.txt"]);
    expect(boundary.rows.tasks.filter(task => tasks.some(created => created.id === task.id))).toEqual(expect.arrayContaining([expect.objectContaining({ userId: "alice", projectId: "work" })]));
    const { attachments } = await (await get(`/tasks/${tasks[0].id}/attachments`)).json() as { attachments: { id: string }[] };
    expect(attachments).toEqual([{ id: expect.any(String), name: "über's.bin", mediaType: "application/octet-stream", byteSize: 4 }]);
    const download = await get(`/attachments/${attachments[0].id}`);
    expect([...new Uint8Array(await download.arrayBuffer())]).toEqual([0, 1, 254, 255]);
    expect(download.headers.get("content-disposition")).toBe(`attachment; filename="_ber_s.bin"; filename*=UTF-8''%C3%BCber%27s.bin`);
  });

  it("serves attachments created by the legacy app unchanged, as a sandboxed download", async () => {
    expect(await (await get("/tasks/legacy-task/attachments")).json()).toEqual({ attachments: [{ id: "legacy", name: "scan (1).pdf", mediaType: "application/pdf", byteSize: 5 }] });
    const download = await get("/attachments/legacy");
    expect([...new Uint8Array(await download.arrayBuffer())]).toEqual([...legacyBytes]);
    expect(Object.fromEntries(["content-type", "content-length", "x-content-type-options", "content-security-policy", "cache-control"].map(name => [name, download.headers.get(name)]))).toEqual({
      "content-type": "application/octet-stream", "content-length": "5", "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox", "cache-control": "private, no-store",
    });
    expect(download.headers.get("content-disposition")).toContain("filename*=UTF-8''scan%20%281%29.pdf");
  });

  it("answers foreign and missing IDs identically at every boundary", async () => {
    const pairs = [
      [await upload([file("x")], { user: "alice" }, "private"), await upload([file("x")], { user: "alice" }, "missing")],
      [await get("/tasks/bob-task/attachments"), await get("/tasks/missing/attachments")],
      [await get("/attachments/bob-file"), await get("/attachments/missing")],
    ];
    for (const [foreign, absent] of pairs) {
      expect(foreign.status).toBe(404);
      expect(await foreign.json()).toEqual(await absent.json());
    }
    expect(stored()).toBe(2);
  });

  it("enforces the legacy limits before storing anything", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    for (const files of [
      [], Array.from({ length: 6 }, (_, index) => file("x", `${index}.txt`)), [file("", "empty.txt")], [file(big, "big.bin")],
      [file(new Uint8Array(4 * 1024 * 1024), "a.bin"), file(new Uint8Array(4 * 1024 * 1024), "b.bin"), file(new Uint8Array(2 * 1024 * 1024 + 20_000), "c.bin")],
      [file("x", "bad\r\n.txt")], [file("x", "../up.txt")], [file("x", "x.txt", "text/plain; charset=utf-8")],
    ]) {
      const response = await upload(files);
      expect(await response.json()).toEqual({ code: "INVALID_INPUT", message: "Check your entry and try again." });
    }
    expect(stored()).toBe(2);
  });

  it("cuts oversized and non-multipart bodies at the transport", async () => {
    const post = (body: string, headers: Record<string, string>) => app.handle(new Request("http://localhost/api/v1/projects/work/files", { method: "POST", headers: { authorization: "Bearer alice", ...headers }, body }));
    expect((await post("{}", { "content-type": "application/json" })).status).toBe(400);
    expect(await (await post("x", { "content-type": "multipart/form-data; boundary=x", "content-length": String(11 * 1024 * 1024) })).json()).toEqual({ code: "FILES_TOO_LARGE", message: "A paste batch must be at most 10 MB." });
    // A body without a usable Content-Length is still counted while streaming.
    const stream = new ReadableStream({ start(controller) { for (let i = 0; i < 11; i += 1) controller.enqueue(new Uint8Array(1024 * 1024)); controller.close(); } });
    expect((await app.handle(new Request("http://localhost/api/v1/projects/work/files", { method: "POST", headers: { authorization: "Bearer alice", "content-type": "multipart/form-data; boundary=x" }, body: stream, duplex: "half" } as RequestInit))).status).toBe(413);
    expect(stored()).toBe(2);
  });

  it("guards cookie uploads with Origin while bearer uploads ignore cookies", async () => {
    expect((await upload([file("x")], { cookie: "alice" })).status).toBe(403);
    expect((await upload([file("x")], { cookie: "alice", origin: "https://attacker.test" })).status).toBe(403);
    expect((await upload([file("x")], { cookie: "alice", origin: "http://localhost:5173" })).status).toBe(201);
    // Bearer bob plus alice's cookie: the upload is bob's, so alice's project is "missing".
    expect((await upload([file("x")], { user: "bob", cookie: "alice" })).status).toBe(404);
    expect((await upload([file("x")], { user: "bob" }, "private")).status).toBe(201);
  });
});
