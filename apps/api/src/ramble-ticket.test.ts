import { describe, expect, it, vi } from "vitest";
import { createApi } from "./app";
import { createSocketTickets } from "./socket-tickets";
import { fixtureSemanticProcessor } from "../test-fixtures/semantic";

function api() {
  const tickets = createSocketTickets();
  const verify = vi.fn(async (headers: Headers) => headers.get("authorization") === "Bearer signed.token" || headers.get("cookie") === "session=browser" ? "user-1" : null);
  const app = createApi({
    allowedOrigins: new Set(["http://localhost:5173"]), verify,
    preferences: async () => ({ smartRecognition: true, projectIds: new Set(), projects: [] }),
    speech: () => { throw new Error("not used"); }, semantic: fixtureSemanticProcessor,
    commit: async () => 0, tickets,
  });
  const post = (headers: Record<string, string>) => app.handle(new Request("http://api.test/api/ramble/ticket", { method: "POST", headers }));
  return { tickets, verify, post };
}

describe("Ramble socket ticket issuance", () => {
  it("mints a no-store single-use ticket for a bearer session", async () => {
    const { tickets, post } = api();
    const response = await post({ authorization: "Bearer signed.token" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as { ticket: string; expiresAt: string };
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
    expect(JSON.stringify(body)).not.toContain("signed.token");
    expect(tickets.consume(body.ticket)).toBe("user-1");
    expect(tickets.consume(body.ticket)).toBeNull();
  });

  it("never mints from ambient browser cookies or an invalid bearer", async () => {
    const { tickets, verify, post } = api();
    expect((await post({ cookie: "session=browser", origin: "http://localhost:5173" })).status).toBe(401);
    expect((await post({ authorization: "Bearer revoked.token" })).status).toBe(401);
    // A valid bearer alongside a cookie authenticates with the bearer alone.
    expect((await post({ authorization: "Bearer revoked.token", cookie: "session=browser" })).status).toBe(401);
    expect(verify.mock.calls.every(([headers]) => headers.get("cookie") === null)).toBe(true);
    expect(tickets.size()).toBe(0);
  });
});
