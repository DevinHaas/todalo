import { describe, expect, it } from "vitest";
import { completedSince, todoistClient } from "./todoist";

const now = new Date("2026-11-06T12:00:00Z");
const day = 86_400_000;

describe("completed tasks range", () => {
  it("reaches back 3 months, a year, or to the Todoist join date", () => {
    expect(now.getTime() - completedSince("quarter", null, now).getTime()).toBe(89 * day);
    expect(now.getTime() - completedSince("year", null, now).getTime()).toBe(365 * day);
    expect(completedSince("all", "2019-03-01T00:00:00Z", now).toISOString()).toBe("2019-03-01T00:00:00.000Z");
    expect(completedSince("all", null, now).getUTCFullYear()).toBe(2007);
  });

  it("fetches one window per 3 months, newest first, each with its pages", async () => {
    const calls: { since: string; until: string; cursor: string | null }[] = [];
    const fetch = (async (input: string | URL | Request) => {
      const query = new URL(String(input)).searchParams;
      calls.push({ since: query.get("since")!, until: query.get("until")!, cursor: query.get("cursor") });
      const first = calls.length === 1;
      return new Response(JSON.stringify({ items: [{ id: String(calls.length), project_id: "p", content: "x" }], next_cursor: first ? "more" : null }));
    }) as typeof globalThis.fetch;
    const client = todoistClient({ clientId: "c", clientSecret: "s", redirectUri: "r", fetch });
    const items = await client.completed("t", new Date(Date.now() - 365 * day));
    // 365 days = four full 89-day windows and a 9-day rest; the first window has two pages.
    expect(calls).toHaveLength(6);
    expect(calls[1]).toMatchObject({ cursor: "more", since: calls[0].since });
    expect(new Date(calls[2].until).getTime()).toBe(new Date(calls[0].since).getTime());
    expect(Math.abs(new Date(calls[5].until).getTime() - new Date(calls[5].since).getTime() - (365 - 4 * 89) * day)).toBeLessThan(1000);
    expect(items.every((item) => item.checked)).toBe(true);
  });
});
