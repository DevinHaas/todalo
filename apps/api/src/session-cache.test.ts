import { describe, expect, it, vi } from "vitest";
import { sessionCache, sessionToken } from "./session-cache";

const cookie = (token: string) => new Headers({ cookie: `theme=dark; __Secure-better-auth.session_token=${token}; other=1` });

describe("sessionCache", () => {
  it("looks a token up once within the TTL, and again after it", async () => {
    let time = 0;
    const verify = vi.fn(async () => "user-1");
    const cache = sessionCache(verify, 1000, () => time);
    expect(await Promise.all([cache.verify(cookie("a")), cache.verify(cookie("a"))])).toEqual(["user-1", "user-1"]);
    expect(verify).toHaveBeenCalledTimes(1);
    time = 1001;
    await cache.verify(cookie("a"));
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it("keeps tokens apart and never caches a rejected or failed lookup", async () => {
    const verify = vi.fn(async (headers: Headers) => {
      const token = sessionToken(headers);
      if (token === "cookie:bad") return null;
      if (token === "cookie:down") throw new Error("database down");
      return token;
    });
    const cache = sessionCache(verify);
    expect(await cache.verify(cookie("a"))).toBe("cookie:a");
    expect(await cache.verify(cookie("b"))).toBe("cookie:b");
    expect(await cache.verify(cookie("bad"))).toBeNull();
    expect(await cache.verify(cookie("bad"))).toBeNull();
    await expect(cache.verify(cookie("down"))).rejects.toThrow();
    await expect(cache.verify(cookie("down"))).rejects.toThrow();
    expect(verify).toHaveBeenCalledTimes(6);
  });

  it("forgets a token (sign-out) and passes requests without one straight through", async () => {
    const verify = vi.fn(async () => "user-1");
    const cache = sessionCache(verify);
    await cache.verify(cookie("a"));
    cache.forget(cookie("a"));
    await cache.verify(cookie("a"));
    await cache.verify(new Headers());
    await cache.verify(new Headers());
    expect(verify).toHaveBeenCalledTimes(4);
  });

  it("keys native bearer tokens separately from cookies", () => {
    expect(sessionToken(new Headers({ authorization: "Bearer abc.sig" }))).toBe("bearer:abc.sig");
    expect(sessionToken(cookie("abc.sig"))).toBe("cookie:abc.sig");
    expect(sessionToken(new Headers({ cookie: "theme=dark" }))).toBeNull();
  });
});

describe("sessionCache.remember", () => {
  it("reuses a lookup made elsewhere (the account read) until the TTL or a forget", async () => {
    let time = 0;
    const verify = vi.fn(async () => "fresh");
    const cache = sessionCache(verify, 1000, () => time);
    cache.remember(cookie("a"), "user-1");
    expect(await cache.verify(cookie("a"))).toBe("user-1");
    cache.forget(cookie("a"));
    expect(await cache.verify(cookie("a"))).toBe("fresh");
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
