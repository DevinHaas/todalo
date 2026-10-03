import { describe, expect, it } from "vitest";
import { validateTaskOrganization } from "./task-organization-validation";

describe("owned task organization", () => {
  it("rejects moving an owned task into another account's project", () => {
    expect(() => validateTaskOrganization({ userId: "alice", projectId: "foreign", sectionId: null }, { id: "foreign", userId: "bob" }, undefined)).toThrow("Project not found");
  });
  it("rejects a section belonging to a different project even for the same account", () => {
    expect(() => validateTaskOrganization({ userId: "alice", projectId: "work", sectionId: "personal-section" }, { id: "work", userId: "alice" }, { id: "personal-section", projectId: "personal", userId: "alice" })).toThrow("Section not found");
  });
});
