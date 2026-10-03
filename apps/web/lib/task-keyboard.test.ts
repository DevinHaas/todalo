import { describe, expect, it } from "vitest";
import { TaskFocusController, taskTreeOrder } from "./task-keyboard";

describe("visible task keyboard focus and selection", () => {
  it("navigates the visible collection, selects independently and restores nearest remaining focus", () => {
    const controller = new TaskFocusController();
    controller.setVisible(["first", "second", "third"]);
    expect(controller.move(1)).toBe("first");
    controller.toggleSelection();
    expect(controller.move(1)).toBe("second");
    controller.toggleSelection();
    expect(controller.targets()).toEqual(["first", "second"]);
    expect(controller.remove(controller.targets())).toBe("third");
    expect(controller.targets()).toEqual(["third"]);
    expect(controller.remove(["third"])).toBeNull();
  });
  it("renders a parent before its children without dropping orphaned visible tasks", () => {
    expect(taskTreeOrder([{ id: "child", parentId: "parent" }, { id: "other", parentId: null }, { id: "parent", parentId: null }, { id: "orphan", parentId: "hidden" }]).map(task => task.id)).toEqual(["other", "parent", "child", "orphan"]);
  });
  it("keeps nearest focus when a date change removes the focused row", () => {
    const controller = new TaskFocusController();
    controller.setVisible(["first", "second", "third"]);
    controller.focus("second");
    controller.setVisible(["first", "third"]);
    expect(controller.focused).toBe("third");
  });
  it("crosses board columns at the corresponding row and skips empty columns", () => {
    const controller = new TaskFocusController();
    controller.setVisible(["a", "b", "c", "d"]);
    controller.focus("b");
    expect(controller.moveColumn([["a", "b"], [], ["c", "d"]], 1)).toBe("d");
    expect(controller.moveColumn([["a", "b"], [], ["c", "d"]], -1)).toBe("b");
  });
});
