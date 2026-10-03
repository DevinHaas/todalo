import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { createTask, updateTask } from "./actions";
import { createLabel, getMetadata, saveFilter, bulkTaskMetadata } from "./metadata-actions";
import { getTasksForUser, getOwnedTask } from "@/lib/tasks";

const boundary = vi.hoisted(() => ({ userId: "alice" as string | null, rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/auth", () => ({ requireUserId: async () => { if (!boundary.userId) throw new Error("Not authenticated"); return boundary.userId; } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@todalo/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  function matches(row: Record<string, unknown>, predicate?: SQL) {
    if (!predicate) return true;
    const query = new PgDialect().sqlToQuery(predicate);
    const expression = query.sql.replace(/"\w+"\."(\w+)"/g, (_, column: string) => `row[${JSON.stringify(column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()))}]`).replace(/\$(\d+)/g, (_, index: string) => `parameters[${Number(index) - 1}]`).replace(/(row\["\w+"\]) in \(([^)]+)\)/g, "[$2].includes($1)").replace(/\band\b/g, "&&").replace(/\bor\b/g, "||").replace(/ = /g, " === ");
    return Boolean(new Function("row", "parameters", `return ${expression}`)(row, query.params));
  }
  function builder(kind: string, table?: Parameters<typeof getTableName>[0], fields?: Record<string, { name: string }>) {
    let predicate: SQL | undefined; let values: Record<string, unknown>[] = []; let limit = Infinity;
    const chain = {
      from(value: typeof table) { table = value; return chain; }, where(value: SQL) { predicate = value; return chain; },
      orderBy() { return chain; }, limit(value: number) { limit = value; return chain; }, returning() { return chain; },
      set(value: Record<string, unknown>) { values = [value]; return chain; }, values(value: Record<string, unknown> | Record<string, unknown>[]) { values = Array.isArray(value) ? value : [value]; return chain; },
      then(resolve: (rows: Record<string, unknown>[]) => unknown, reject: (error: unknown) => unknown) {
        try {
          const key = getTableName(table!); const rows = boundary.rows[key] ??= [];
          let result = rows.filter(row => matches(row, predicate)).slice(0, limit);
          if (kind === "insert") { result = values.map((value, index) => ({ id: `new-${rows.length + index}`, priority: 4, ...value })); rows.push(...result); }
          if (kind === "update") result.forEach(row => Object.assign(row, values[0]));
          if (kind === "delete") boundary.rows[key] = rows.filter(row => !result.includes(row));
          if (fields) result = result.map(row => Object.fromEntries(Object.entries(fields).map(([name, column]) => [name, row[column.name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())]])));
          return Promise.resolve(result).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    }; return chain;
  }
  return { db: { select: (fields?: Record<string, { name: string }>) => builder("select", undefined, fields), insert: (table: Parameters<typeof getTableName>[0]) => builder("insert", table), update: (table: Parameters<typeof getTableName>[0]) => builder("update", table), delete: (table: Parameters<typeof getTableName>[0]) => builder("delete", table) } };
});
beforeEach(() => {
  boundary.userId = "alice"; boundary.rows = {
    tasks: [{ id: "task", userId: "alice", title: "Review", projectId: null, sectionId: null, parentId: null, priority: 4 }, { id: "foreign-task", userId: "bob", title: "Private", priority: 4 }],
    labels: [{ id: "urgent", userId: "alice", name: "Urgent" }, { id: "foreign-label", userId: "bob", name: "Private" }], projects: [{ id: "foreign-project", userId: "bob" }],
  };
});
describe("authenticated metadata persistence", () => {
  it("creates labeled tasks and retrieves edited description, deadline and priority through task reads", async () => {
    const id = await createTask({ title: "Plan", priority: 1, labelIds: ["urgent"] });
    await updateTask({ id, description: "A complete plan", deadline: new Date("2026-10-10"), priority: 2 });
    expect(await getOwnedTask("alice", id)).toMatchObject({ description: "A complete plan", priority: 2, deadline: new Date("2026-10-10"), labelIds: ["urgent"] });
    expect(await getOwnedTask("bob", id)).toBeNull();
  });
  it("rejects foreign labels and mixed selections before any metadata update", async () => {
    await expect(updateTask({ id: "task", priority: 1, labelIds: ["foreign-label"] })).rejects.toThrow("Label not found");
    await expect(bulkTaskMetadata({ ids: ["task", "foreign-task"], priority: 1 })).rejects.toThrow("Task not found");
    expect((await getTasksForUser("alice"))[0].priority).toBe(4);
  });
  it("persists account labels and bounded saved filters while rejecting foreign associations", async () => {
    await createLabel({ name: "Home" });
    await saveFilter({ name: "Urgent work", definition: { labelId: "urgent", priority: 1, status: "open", due: "any" } });
    expect((await getMetadata()).filters[0].name).toBe("Urgent work");
    await expect(saveFilter({ name: "Forbidden", definition: { labelId: "foreign-label", status: "any", due: "any" } })).rejects.toThrow("Label not found");
    await expect(saveFilter({ name: "Forbidden", definition: { projectId: "foreign-project", status: "any", due: "any" } })).rejects.toThrow("Project not found");
    boundary.userId = "bob"; expect((await getMetadata()).labels.map(label => label.name)).toEqual(["Private"]);
  });
});
