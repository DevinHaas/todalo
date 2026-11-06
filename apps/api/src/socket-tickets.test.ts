import { describe, expect, it } from "vitest";
import { createSocketTickets } from "./socket-tickets";

describe("Ramble socket tickets", () => {
  it("issues opaque random tickets that resolve to their user exactly once", () => {
    const tickets = createSocketTickets();
    const first = tickets.issue("user-1");
    const second = tickets.issue("user-1");
    expect(first.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.ticket).not.toBe(second.ticket);
    expect(first.ticket).not.toContain("user-1");
    expect(tickets.consume(first.ticket)).toBe("user-1");
    expect(tickets.consume(first.ticket)).toBeNull();
    expect(tickets.consume(second.ticket)).toBe("user-1");
  });

  it("expires unused tickets after the short lifetime", () => {
    let clock = 1_000_000;
    const tickets = createSocketTickets({ ttlMs: 30_000, now: () => clock });
    const { ticket, expiresAt } = tickets.issue("user-1");
    expect(expiresAt).toBe(new Date(1_030_000).toISOString());
    clock += 30_000;
    expect(tickets.consume(ticket)).toBeNull();
    // An expired ticket stays unusable even if the clock were to move back.
    clock = 1_000_000;
    expect(tickets.consume(ticket)).toBeNull();
  });

  it("rejects unknown and malformed tickets and sweeps expired entries", () => {
    let clock = 0;
    const tickets = createSocketTickets({ ttlMs: 10, now: () => clock });
    expect(tickets.consume("")).toBeNull();
    expect(tickets.consume("not-a-ticket")).toBeNull();
    tickets.issue("user-1");
    tickets.issue("user-2");
    expect(tickets.size()).toBe(2);
    clock = 10;
    tickets.issue("user-3");
    expect(tickets.size()).toBe(1);
  });
});
