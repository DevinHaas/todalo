import { beforeEach, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { POST } from "./route";
import { GET as download } from "./[id]/route";
import { GET as list } from "../tasks/[id]/attachments/route";

const boundary = vi.hoisted(() => ({ userId: "alice" as string | null, fail: false, rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/auth", () => ({ requireUserId: async () => { if (!boundary.userId) throw new Error("Not authenticated"); return boundary.userId; } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@todalo/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  function builder(kind: string, table?: Parameters<typeof getTableName>[0], fields?: Record<string, { name: string }>) {
    let predicate: SQL | undefined; let values: Record<string, unknown>[] = [];
    const chain = {
      from(value: typeof table) { table = value; return chain; }, where(value: SQL) { predicate = value; return chain; }, limit() { return chain; }, orderBy() { return chain; },
      values(value: Record<string, unknown> | Record<string, unknown>[]) { values = Array.isArray(value) ? value : [value]; return chain; },
      then(resolve: (rows: Record<string, unknown>[]) => unknown, reject: (error: unknown) => unknown) {
        const rows = boundary.rows[getTableName(table!)] ??= [];
        let found = rows;
        if (predicate) {
          const query = new PgDialect().sqlToQuery(predicate);
          const expression = query.sql.replace(/"\w+"\."(\w+)"/g, (_, column: string) => `row[${JSON.stringify(column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()))}]`).replace(/\$(\d+)/g, (_, index: string) => `parameters[${Number(index) - 1}]`).replace(/\band\b/g, "&&").replace(/ = /g, " === ");
          found = rows.filter(row => new Function("row", "parameters", `return ${expression}`)(row, query.params));
        }
        if (kind === "insert") { found = values; rows.push(...values); }
        if (fields) found = found.map(row => Object.fromEntries(Object.entries(fields).map(([key, column]) => [key, row[column.name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())]])));
        return Promise.resolve(found).then(resolve, reject);
      },
    }; return chain;
  }
  return { db: { select: (fields?: Record<string, { name: string }>) => builder("select", undefined, fields), insert: (table: Parameters<typeof getTableName>[0]) => builder("insert", table), batch: async (queries: PromiseLike<unknown>[]) => { if (boundary.fail) throw new Error("DB unavailable"); return Promise.all(queries); } } };
});
beforeEach(() => { boundary.userId = "alice"; boundary.fail = false; boundary.rows = { projects: [{ id: "work", userId: "alice" }, { id: "private", userId: "bob" }], tasks: [], task_attachments: [] }; });
function upload(projectId = "work", files = [new File(["Hello attachment"], "notes.txt", { type: "text/plain" })], origin = "https://todalo.test") {
  const body = new FormData(); body.set("projectId", projectId); files.forEach(file => body.append("files", file));
  return POST(new Request("https://todalo.test/api/attachments", { method: "POST", body, headers: { Origin: origin } }));
}
it("pastes a named task and reads its usable content through protected public endpoints", async () => {
  const created = await upload(); expect(created.status).toBe(201);
  const { tasks } = await created.json(); expect(tasks[0].title).toBe("notes.txt");
  const listed = await list(new Request("https://todalo.test"), { params: Promise.resolve({ id: tasks[0].id }) });
  const attachments = await listed.json(); expect(attachments[0]).toMatchObject({ name: "notes.txt", byteSize: 16 }); expect(attachments[0]).not.toHaveProperty("content");
  const response = await download(new Request("https://todalo.test"), { params: Promise.resolve({ id: attachments[0].id }) });
  expect(await response.text()).toBe("Hello attachment"); expect(response.headers.get("content-disposition")).toContain("attachment;"); expect(response.headers.get("x-content-type-options")).toBe("nosniff"); expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("rejects other accounts at upload, list and download boundaries", async () => {
  expect((await upload("private")).status).toBe(404);
  const { tasks } = await (await upload()).json();
  const attachments = await (await list(new Request("https://todalo.test"), { params: Promise.resolve({ id: tasks[0].id }) })).json();
  boundary.userId = "bob";
  expect((await list(new Request("https://todalo.test"), { params: Promise.resolve({ id: tasks[0].id }) })).status).toBe(404);
  expect((await download(new Request("https://todalo.test"), { params: Promise.resolve({ id: attachments[0].id }) })).status).toBe(404);
  boundary.userId = null;
  expect((await upload()).status).toBe(401);
  expect((await download(new Request("https://todalo.test"), { params: Promise.resolve({ id: attachments[0].id }) })).status).toBe(401);
  expect((await list(new Request("https://todalo.test"), { params: Promise.resolve({ id: tasks[0].id }) })).status).toBe(401);
});
it("keeps failures retryable and rejects unsafe or oversized batches before storage", async () => {
  expect((await upload("work", undefined, "https://attacker.test")).status).toBe(403);
  expect((await upload("work", [new File(["x"], "bad\r\n.txt")])).status).toBe(400);
  expect((await upload("work", [new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.bin")])).status).toBe(400);
  boundary.fail = true;
  expect((await upload()).status).toBe(503);
  boundary.fail = false;
  const { tasks } = await (await upload()).json(); expect(tasks).toHaveLength(1);
});
it("creates each file as its own task preserving binary content and safe Unicode names", async () => {
  const { tasks } = await (await upload("work", [new File([new Uint8Array([0, 255, 128, 10])], "über's.txt"), new File(["second"], "two.txt")])).json();
  expect(tasks.map((task: { title: string }) => task.title)).toEqual(["über's.txt", "two.txt"]);
  const [first] = await (await list(new Request("https://todalo.test"), { params: Promise.resolve({ id: tasks[0].id }) })).json();
  const response = await download(new Request("https://todalo.test"), { params: Promise.resolve({ id: first.id }) });
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0, 255, 128, 10]);
  expect(response.headers.get("content-disposition")).toContain("%C3%BCber%27s.txt");
});
