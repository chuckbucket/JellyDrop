import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTtlCache } from "./ttlCache";

describe("createTtlCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes once and reuses the cached value within the TTL", async () => {
    const cache = createTtlCache<string, number>(1000);
    const compute = vi.fn().mockResolvedValue(42);

    expect(await cache("key", compute)).toBe(42);
    expect(await cache("key", compute)).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("recomputes once the TTL expires", async () => {
    const cache = createTtlCache<string, number>(1000);
    const compute = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await cache("key", compute)).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(await cache("key", compute)).toBe(2);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("caches independently per key", async () => {
    const cache = createTtlCache<string, number>(1000);
    const compute = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await cache("a", compute)).toBe(1);
    expect(await cache("b", compute)).toBe(2);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("shares the in-flight promise across concurrent callers instead of computing twice", async () => {
    const cache = createTtlCache<string, number>(1000);
    let resolve!: (value: number) => void;
    const compute = vi.fn(() => new Promise<number>((r) => (resolve = r)));

    const first = cache("key", compute);
    const second = cache("key", compute);
    resolve(7);

    expect(await first).toBe(7);
    expect(await second).toBe(7);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed computation", async () => {
    const cache = createTtlCache<string, number>(1000);
    const compute = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(42);

    await expect(cache("key", compute)).rejects.toThrow("boom");
    expect(await cache("key", compute)).toBe(42);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
