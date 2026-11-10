import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Pricing } from "./pricing";

const html = (foundersLeft: number | null) => renderToString(createElement(Pricing, { foundersLeft }));

describe("Pricing founder offer", () => {
  it("shows the live seats left from Stripe", () => {
    expect(html(13)).toContain("13 of 20 left");
  });
  it("falls back to the full Lifetime price once sold out", () => {
    const out = html(0);
    expect(out).not.toContain("of 20 left");
    expect(out).toContain("One payment, yours for good");
    expect(out).toContain(">149<");
  });
  it("shows the offer without a count before Stripe is connected", () => {
    expect(html(null)).toContain("−50% for the first 20");
  });
});
