import { describe, expect, it } from "vitest";
import { foundersLeft } from "./founders";

const env = { STRIPE_SECRET_KEY: "sk_test", STRIPE_FOUNDERS_COUPON: "FOUNDERS" };
const stripe = (body: object, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe("foundersLeft", () => {
  it("is null without Stripe settings", async () => {
    expect(await foundersLeft({}, stripe({}))).toBeNull();
  });
  it("counts the seats left on the coupon", async () => {
    expect(await foundersLeft(env, stripe({ max_redemptions: 20, times_redeemed: 7 }))).toBe(13);
  });
  it("asks Stripe for the coupon with the secret key", async () => {
    let call: [string, RequestInit] | undefined;
    const spy = (async (url: string, init: RequestInit) => {
      call = [url, init];
      return { ok: true, json: async () => ({ max_redemptions: 20, times_redeemed: 0 }) };
    }) as unknown as typeof fetch;
    expect(await foundersLeft({ ...env, STRIPE_FOUNDERS_COUPON: "FOUNDERS 50" }, spy)).toBe(20);
    expect(call?.[0]).toBe("https://api.stripe.com/v1/coupons/FOUNDERS%2050");
    expect(call?.[1].headers).toEqual({ Authorization: "Bearer sk_test" });
  });
  it("never goes below zero", async () => {
    expect(await foundersLeft(env, stripe({ max_redemptions: 20, times_redeemed: 21 }))).toBe(0);
  });
  it("is null when Stripe fails", async () => {
    expect(await foundersLeft(env, stripe({}, false))).toBeNull();
    expect(await foundersLeft(env, (async () => { throw new Error("offline"); }) as typeof fetch)).toBeNull();
  });
});
