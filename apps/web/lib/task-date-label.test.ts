import { expect, it } from "vitest";
import { taskDateLabel } from "./task-date-label";
it("renders one calendar label independently of host locale and timezone", () => {
  const before = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    expect(taskDateLabel("2026-10-11T00:00:00.000Z")).toBe("11 Oct 2026");
    process.env.TZ = "Europe/Zurich";
    expect(taskDateLabel(new Date("2026-10-11T00:00:00.000Z"))).toBe("11 Oct 2026");
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
});
it("retains a chosen local calendar day after hydration", () => {
  expect(taskDateLabel("2026-10-10T22:00:00.000Z", "Europe/Zurich")).toBe("11 Oct 2026");
  expect(taskDateLabel("2026-10-11T07:00:00.000Z", "America/Los_Angeles")).toBe("11 Oct 2026");
});
