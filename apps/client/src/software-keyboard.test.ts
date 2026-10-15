import { describe, expect, it } from "vitest";
import { keyboardInset } from "./software-keyboard";

describe("software keyboard inset", () => {
  it("reports the keyboard's height and ignores small browser-chrome changes", () => {
    expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336);
    expect(keyboardInset(844, { height: 470, offsetTop: 40 })).toBe(334);
    expect(keyboardInset(844, { height: 790, offsetTop: 0 })).toBe(0);
  });
});
