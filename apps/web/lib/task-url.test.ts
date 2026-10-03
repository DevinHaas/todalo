import { expect, it } from "vitest";
import { copyTaskUrl } from "./task-url";
it("copies the canonical URL and reports blocked clipboard writes", async () => {
  let copied = "";
  await copyTaskUrl("owned task", { writeText: async value => { copied = value; } }, "https://todalo.example");
  expect(copied).toBe("https://todalo.example/tasks/owned%20task");
  await expect(copyTaskUrl("task", { writeText: async () => { throw new Error("Denied"); } }, "https://todalo.example")).rejects.toThrow("browser blocked");
});
