import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFilter, createLabel, deleteFilter, deleteLabel, getMetadataForUser, getOwnedFilter, getOwnedLabel, MetadataIdConflictError, updateFilter, updateLabel } from "./metadata";
import { filterDefinitionSchema, matchesSavedFilter, MissingReferenceError } from "./metadata-input";

const boundary = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@todalo/db", async () => {
  const { relationalBoundary } = await import("../../../apps/web/lib/testing/relational-boundary");
  return relationalBoundary(boundary);
});

const OPERATION = "6f1c1b7e-3a52-4c55-9b2a-3f4f3e8f0a11";
// Definitions exactly as the legacy MetadataDirectory saved them: the blank
// form ({ status, due }), cleared selects (null), and rows from before the
// status/due defaults were written.
const legacyFilters = [
  { id: "urgent-open", userId: "alice", name: "Urgent open", definition: { priority: 1, labelId: "urgent", status: "open", due: "any" } },
  { id: "cleared", userId: "alice", name: "Cleared selects", definition: { priority: null, labelId: null, projectId: null, status: "any", due: "overdue" } },
  { id: "bare", userId: "alice", name: "Bare row", definition: { projectId: "work" } },
  { id: "bob-filter", userId: "bob", name: "Bob only", definition: { status: "done", due: "any" } },
];

beforeEach(() => {
  boundary.rows = {
    labels: [
      { id: "urgent", userId: "alice", name: "Urgent", color: "#ff0000" },
      { id: "bob-label", userId: "bob", name: "Private", color: null },
    ],
    projects: [{ id: "work", userId: "alice", name: "Work" }, { id: "bob-project", userId: "bob", name: "Home" }],
    saved_filters: structuredClone(legacyFilters),
  };
});

describe("legacy saved filters", () => {
  it("open unchanged: parsing only fills the legacy defaults", async () => {
    const { filters } = await getMetadataForUser("alice");
    expect(filters.map(filter => filter.id)).toEqual(["urgent-open", "cleared", "bare"]);
    expect(filters[0].definition).toEqual({ priority: 1, labelId: "urgent", status: "open", due: "any" });
    expect(filters[1].definition).toEqual({ priority: null, labelId: null, projectId: null, status: "any", due: "overdue" });
    expect(filters[2].definition).toEqual({ projectId: "work", status: "open", due: "any" });
    // Reading never rewrites the stored row.
    expect(boundary.rows.saved_filters[2].definition).toEqual({ projectId: "work" });
  });

  it("evaluate with the legacy rules", () => {
    const now = new Date(2026, 9, 15, 12);
    const task = { priority: 1, labelIds: ["urgent"], projectId: null, status: "todo", dueDate: null };
    const [urgent, cleared, bare] = legacyFilters.map(filter => filterDefinitionSchema.parse(filter.definition));
    expect(matchesSavedFilter(task, urgent, now)).toBe(true);
    expect(matchesSavedFilter({ ...task, status: "done" }, urgent, now)).toBe(false);
    expect(matchesSavedFilter({ ...task, labelIds: [] }, urgent, now)).toBe(false);
    expect(matchesSavedFilter({ ...task, status: "done", dueDate: new Date(2026, 9, 14, 23) }, cleared, now)).toBe(true);
    expect(matchesSavedFilter({ ...task, dueDate: new Date(2026, 9, 15, 0) }, cleared, now)).toBe(false);
    expect(matchesSavedFilter({ ...task, projectId: "work" }, bare, now)).toBe(true);
    expect(() => filterDefinitionSchema.parse({ sql: "drop table tasks" })).toThrow();
  });
});

describe("labels", () => {
  it("are owner-scoped: foreign IDs behave like missing ones", async () => {
    expect((await getMetadataForUser("alice")).labels).toEqual([{ id: "urgent", name: "Urgent", color: "#ff0000", favorite: false }]);
    expect(await getOwnedLabel("alice", "bob-label")).toBeNull();
    expect(await updateLabel("alice", "bob-label", { name: "Taken" })).toBeNull();
    expect(await deleteLabel("alice", "bob-label")).toBe(false);
    expect(boundary.rows.labels.find(label => label.id === "bob-label")).toMatchObject({ name: "Private" });
  });

  it("create retry-safely and rename without touching an omitted color", async () => {
    expect(await createLabel("alice", { id: OPERATION, name: " Home ", color: "#00ff00" })).toMatchObject({ created: true, label: { id: OPERATION, name: "Home" } });
    expect(await createLabel("alice", { id: OPERATION, name: "Home", color: "#00ff00" })).toMatchObject({ created: false, label: { id: OPERATION } });
    expect(boundary.rows.labels.filter(label => label.id === OPERATION)).toHaveLength(1);
    await expect(createLabel("bob", { id: OPERATION, name: "Mine" })).rejects.toBeInstanceOf(MetadataIdConflictError);
    expect(await updateLabel("alice", "urgent", { name: "Now" })).toMatchObject({ name: "Now", color: "#ff0000" });
    await expect(createLabel("alice", { name: "", color: "red" })).rejects.toThrow();
  });

  it("deleting one keeps filters that named it; they then match nothing and cannot be resaved with it", async () => {
    expect(await deleteLabel("alice", "urgent")).toBe(true);
    const filter = await getOwnedFilter("alice", "urgent-open");
    expect(filter?.definition?.labelId).toBe("urgent");
    expect(matchesSavedFilter({ priority: 1, labelIds: [], projectId: null, status: "todo", dueDate: null }, filter!.definition!)).toBe(false);
    await expect(updateFilter("alice", "urgent-open", { name: "Urgent open", definition: filter!.definition! })).rejects.toThrow(MissingReferenceError);
  });
});

describe("saved filters", () => {
  it("are owner-scoped and refuse foreign labels and projects (legacy messages)", async () => {
    expect(await getOwnedFilter("alice", "bob-filter")).toBeNull();
    expect(await updateFilter("alice", "bob-filter", { name: "Taken", definition: { status: "any", due: "any" } })).toBeNull();
    expect(await deleteFilter("alice", "bob-filter")).toBe(false);
    await expect(createFilter("alice", { name: "X", definition: { labelId: "bob-label", status: "any", due: "any" } })).rejects.toThrow("Label not found");
    await expect(createFilter("alice", { name: "X", definition: { projectId: "bob-project", status: "any", due: "any" } })).rejects.toThrow("Project not found");
    expect(boundary.rows.saved_filters).toHaveLength(4);
  });

  it("create retry-safely, update and delete the owner's filter", async () => {
    const input = { id: OPERATION, name: "Today", definition: filterDefinitionSchema.parse({ due: "today" }) };
    expect(await createFilter("alice", input)).toMatchObject({ created: true, filter: { id: OPERATION, definition: { status: "open", due: "today" } } });
    expect(await createFilter("alice", input)).toMatchObject({ created: false });
    expect(await updateFilter("alice", OPERATION, { name: "Work today", definition: { projectId: "work", status: "open", due: "today" } })).toMatchObject({ name: "Work today", definition: { projectId: "work" } });
    expect(await deleteFilter("alice", OPERATION)).toBe(true);
    expect(await getOwnedFilter("alice", OPERATION)).toBeNull();
  });

  it("save Todoist queries (invalid ones refused); saving a query replaces a legacy definition", async () => {
    const input = { id: OPERATION, name: "Work", query: " (today | overdue) & #Work ", description: "Mine", color: "#4073ff", favorite: true };
    expect((await createFilter("alice", input)).filter).toEqual({ id: OPERATION, name: "Work", query: "(today | overdue) & #Work", definition: null, description: "Mine", color: "#4073ff", favorite: true });
    await expect(createFilter("alice", { name: "Bad", query: "today &" })).rejects.toThrow();
    await expect(createFilter("alice", { name: "Both", query: "today", definition: { status: "open", due: "any" } })).rejects.toThrow();
    await expect(createFilter("alice", { name: "Neither" } as never)).rejects.toThrow();
    // Names in a query are not references: an unknown one just matches nothing.
    expect((await createFilter("alice", { name: "Bob's", query: "@Private" })).filter.query).toBe("@Private");
    expect(await updateFilter("alice", "bare", { name: "Bare row", query: "#Work" })).toMatchObject({ query: "#Work", definition: null });
    expect(boundary.rows.saved_filters.find(row => row.id === "bare")).toMatchObject({ query: "#Work", definition: null });
    // A legacy write (the old web form) keeps working and clears any query.
    expect(await updateFilter("alice", "bare", { name: "Bare row", definition: { projectId: "work", status: "open", due: "any" } })).toMatchObject({ query: null, definition: { projectId: "work" } });
  });
});

describe("favorites", () => {
  it("label favorite is saved and an omitted one is kept", async () => {
    expect(await updateLabel("alice", "urgent", { name: "Urgent", favorite: true })).toEqual({ id: "urgent", name: "Urgent", color: "#ff0000", favorite: true });
    expect(await updateLabel("alice", "urgent", { name: "Now" })).toMatchObject({ favorite: true });
  });
});
