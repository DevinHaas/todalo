import { describe, expect, it } from "vitest";
import { matchesSavedFilter, filterDefinitionSchema, taskMetadataSchema } from "./task-metadata";

describe("personal metadata and saved filter contracts", () => {
  it("matches a saved priority and label filter against actual task metadata", () => {
    const filter = filterDefinitionSchema.parse({ priority: 1, labelId: "urgent", status: "open" });
    expect(matchesSavedFilter({ priority: 1, labelIds: ["urgent"], projectId: null, status: "todo", dueDate: null }, filter)).toBe(true);
    expect(matchesSavedFilter({ priority: 2, labelIds: ["urgent"], projectId: null, status: "todo", dueDate: null }, filter)).toBe(false);
    expect(matchesSavedFilter({ priority: 1, labelIds: ["urgent"], projectId: null, status: "done", dueDate: null }, filter)).toBe(false);
  });
  it("allows clearing deadlines and labels while rejecting invalid priorities and arbitrary predicates", () => {
    expect(taskMetadataSchema.parse({ priority: 4, deadline: null, labelIds: [] })).toEqual({ priority: 4, deadline: null, labelIds: [] });
    expect(() => taskMetadataSchema.parse({ priority: 0 })).toThrow();
    expect(() => filterDefinitionSchema.parse({ sql: "drop table tasks" })).toThrow();
  });
});
