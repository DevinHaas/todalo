import { describe, expect, it } from "vitest";
import { MAX_SUBTASK_DEPTH, ancestorIds, subtreeHeight, subtreeIds, taskTree, validateTaskParent } from "./task-parent-validation";

const owner = "owner";
const t = (id: string, parentId: string | null = null, userId = owner) => ({ id, userId, parentId });
// a > b > c > d (d at depth 3), plus a free root x with child y.
const tasks = [t("a"), t("b", "a"), t("c", "b"), t("d", "c"), t("x"), t("y", "x")];

describe("task parent validation", () => {
  it("keeps the limit at three sub-task levels", () => {
    expect(MAX_SUBTASK_DEPTH).toBe(3);
  });
  it("allows clearing a parent and nesting under an owned root", () => {
    expect(() => validateTaskParent({ userId: owner, taskId: "b", parentId: null }, tasks)).not.toThrow();
    expect(() => validateTaskParent({ userId: owner, parentId: "a" }, tasks)).not.toThrow();
  });
  it("allows a new task at the deepest level and refuses one below it", () => {
    expect(() => validateTaskParent({ userId: owner, parentId: "c" }, tasks)).not.toThrow();
    expect(() => validateTaskParent({ userId: owner, parentId: "d" }, tasks)).toThrow("at most 3 levels");
  });
  it("counts the moved subtree's own height", () => {
    // x>y is two levels: under b (depth 1) it reaches depth 3, under c depth 4.
    expect(() => validateTaskParent({ userId: owner, taskId: "x", parentId: "b" }, tasks)).not.toThrow();
    expect(() => validateTaskParent({ userId: owner, taskId: "x", parentId: "c" }, tasks)).toThrow("at most 3 levels");
  });
  it("refuses self-parenting and cycles", () => {
    expect(() => validateTaskParent({ userId: owner, taskId: "a", parentId: "a" }, tasks)).toThrow("own parent");
    expect(() => validateTaskParent({ userId: owner, taskId: "a", parentId: "c" }, tasks)).toThrow("its own sub-task");
  });
  it("refuses missing and other users' parents alike", () => {
    expect(() => validateTaskParent({ userId: owner, parentId: "missing" }, tasks)).toThrow("not found");
    expect(() => validateTaskParent({ userId: "other", parentId: "a" }, tasks)).toThrow("not found");
  });
  it("walks ancestors, heights and subtrees", () => {
    const tree = taskTree(tasks);
    expect(ancestorIds("d", tree)).toEqual(["c", "b", "a"]);
    expect(subtreeHeight("a", tree)).toBe(3);
    expect(subtreeHeight("d", tree)).toBe(0);
    expect(subtreeIds("b", tree)).toEqual(["b", "c", "d"]);
    // A corrupt loop never hangs.
    expect(ancestorIds("p", taskTree([t("p", "q"), t("q", "p")]))).toEqual(["q"]);
  });
});
