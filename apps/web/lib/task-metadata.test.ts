import { describe, expect, it } from "vitest";
import { matchesSavedFilter, filterDefinitionSchema, taskMetadataSchema } from "./task-metadata";
import { keyboardCommands, defaultPreferences, effectiveBindings, KeyboardDispatcher } from "./keyboard";

describe("personal metadata and saved filter contracts", () => {
  it("exposes working metadata commands and applies customized bindings in task and Quick Add contexts", () => {
    expect(keyboardCommands.find(command => command.id === "task.deadline")?.availability).toBe("available");
    expect(keyboardCommands.find(command => command.id === "quick-add.description")?.availability).toBe("available");
    const preferences = { ...defaultPreferences(), overrides: { "task.priority": ["Alt+y"], "quick-add.description": ["Alt+ArrowDown"] } };
    expect(effectiveBindings("task.priority", preferences, "mac")).toEqual(["Alt+y"]);
    const dispatcher = new KeyboardDispatcher();
    const event = { key: "d", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false };
    expect(dispatcher.dispatch(event, [{ id: "task.deadline", bindings: ["d"] }, { id: "project.sort-date", bindings: ["d"] }], "focused-task").commandId).toBe("task.deadline");
    expect(dispatcher.dispatch({ ...event, key: "ArrowDown", altKey: true }, [{ id: "quick-add.description", bindings: effectiveBindings("quick-add.description", preferences, "mac"), allowInEditor: true }], "quick-add", 0, { typing: true }).commandId).toBe("quick-add.description");
  });
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
