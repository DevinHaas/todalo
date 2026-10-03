import { describe, expect, it } from "vitest";
import { validateTaskParent } from "./task-parent-validation";

const owner = "owner";
const parent = { id: "parent", userId: owner, parentId: null };

describe("single-level task parent validation", () => {
  it("preserves ordinary task creation and allows clearing a parent", () => {
    expect(() => validateTaskParent({ userId: owner, parentId: null }, undefined)).not.toThrow();
    expect(() => validateTaskParent({ userId: owner, taskId: "child", parentId: null }, undefined, true)).not.toThrow();
  });
  it("accepts a top-level parent owned by the user", () => {
    expect(() => validateTaskParent({ userId: owner, parentId: "parent" }, parent)).not.toThrow();
  });
  it("rejects self-parenting", () => {
    expect(() => validateTaskParent({ userId: owner, taskId: "parent", parentId: "parent" }, parent)).toThrow("own parent");
  });
  it("rejects missing or mismatched parents", () => {
    expect(() => validateTaskParent({ userId: owner, parentId: "missing" }, undefined)).toThrow("not found");
    expect(() => validateTaskParent({ userId: owner, parentId: "different" }, parent)).toThrow("not found");
  });
  it("rejects another user's parent", () => {
    expect(() => validateTaskParent({ userId: "other", parentId: "parent" }, parent)).toThrow("not found");
  });
  it("rejects a parent which is already a sub-task", () => {
    expect(() => validateTaskParent({ userId: owner, parentId: "parent" }, { ...parent, parentId: "grandparent" })).toThrow("cannot have");
  });
  it("rejects moving an existing parent under another task", () => {
    expect(() => validateTaskParent({ userId: owner, taskId: "has-children", parentId: "parent" }, parent, true)).toThrow("cannot become");
  });
});
