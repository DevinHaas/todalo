import { expect, it } from "vitest";
import { publish, subscribe } from "./live";

it("a task write's frame carries what it wrote; a bare topic stays a bare frame", () => {
  const frames: unknown[] = [];
  const stop = subscribe("frame-user", change => frames.push(change));
  publish("frame-user", "calendar");
  publish("frame-user", { topic: "sync", tasks: [{ id: "t1" }] });
  publish("frame-user", { topic: "sync", deleted: ["t2"] });
  stop();
  expect(frames).toEqual([{ topic: "calendar" }, { topic: "sync", tasks: [{ id: "t1" }] }, { topic: "sync", deleted: ["t2"] }]);
});
