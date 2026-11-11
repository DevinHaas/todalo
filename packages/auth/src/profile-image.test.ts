import { describe, expect, it } from "vitest";
import { profileImageAllowed } from "./config";

describe("profile photo", () => {
  it("keeps an unset photo, a provider URL and a small uploaded photo", () => {
    expect(profileImageAllowed(undefined)).toBe(true);
    expect(profileImageAllowed(null)).toBe(true);
    expect(profileImageAllowed("https://lh3.googleusercontent.com/a/abc=s96-c")).toBe(true);
    expect(profileImageAllowed("data:image/jpeg;base64,/9j/4AAQSkZJRg==")).toBe(true);
  });

  it("refuses scripts, other schemes, other types and oversized photos", () => {
    expect(profileImageAllowed("javascript:alert(1)")).toBe(false);
    expect(profileImageAllowed("http://example.com/a.png")).toBe(false);
    expect(profileImageAllowed("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(profileImageAllowed("data:text/html;base64,PGgxPg==")).toBe(false);
    expect(profileImageAllowed(`data:image/jpeg;base64,${"A".repeat(200_001)}`)).toBe(false);
    expect(profileImageAllowed(42)).toBe(false);
  });
});
