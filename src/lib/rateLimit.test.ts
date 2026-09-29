import { describe, expect, it } from "vitest";
import { clientIp, RateLimiter, waitText } from "./rateLimit";

describe("RateLimiter", () => {
  const limit = { max: 3, windowMs: 60_000 };

  it("laat max pogingen per venster toe en daarna niet meer", () => {
    let t = 0;
    const rl = new RateLimiter(() => t);
    expect([1, 2, 3].map(() => rl.hit("a", limit).ok)).toEqual([true, true, true]);
    const r = rl.hit("a", limit);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBe(60);
    t = 30_000;
    expect(rl.hit("a", limit).retryAfter).toBe(30);
  });

  it("begint opnieuw na het venster", () => {
    let t = 0;
    const rl = new RateLimiter(() => t);
    for (let i = 0; i < 4; i++) rl.hit("a", limit);
    t = 60_000;
    expect(rl.hit("a", limit).ok).toBe(true);
  });

  it("houdt sleutels gescheiden", () => {
    const rl = new RateLimiter(() => 0);
    for (let i = 0; i < 3; i++) rl.hit("a", limit);
    expect(rl.hit("a", limit).ok).toBe(false);
    expect(rl.hit("b", limit).ok).toBe(true);
  });

  it("blocked telt niet mee; reset wist de teller", () => {
    const rl = new RateLimiter(() => 0);
    expect(rl.blocked("a", limit)).toBe(0);
    for (let i = 0; i < 3; i++) rl.hit("a", limit);
    expect(rl.blocked("a", limit)).toBe(60);
    expect(rl.blocked("a", limit)).toBe(60);
    rl.reset("a");
    expect(rl.blocked("a", limit)).toBe(0);
  });
});

describe("clientIp", () => {
  it("voorkeur voor Cloudflare, dan X-Forwarded-For, anders local", () => {
    expect(clientIp(new Headers({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("local");
  });
});

describe("waitText", () => {
  it("seconden, minuten, uren", () => {
    expect(waitText(45)).toBe("45 seconden");
    expect(waitText(60)).toBe("1 minuut");
    expect(waitText(14 * 60 + 1)).toBe("15 minuten");
    expect(waitText(5000)).toBe("2 uur");
  });
});
