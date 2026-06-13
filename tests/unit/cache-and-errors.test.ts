import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryCache } from "../../src/server/cache/cache";
import { publicErrorMessage } from "../../src/server/errors";

describe("cache and public errors", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores values and enforces lock tokens", async () => {
    const cache = new InMemoryCache();
    await cache.set("state", { ok: true }, 5);
    await expect(cache.get("state")).resolves.toEqual({ ok: true });

    const token = await cache.acquireLock("lock", 5);
    expect(token).toBeTruthy();
    await expect(cache.acquireLock("lock", 5)).resolves.toBeNull();
    await cache.releaseLock("lock", "wrong-token");
    await expect(cache.acquireLock("lock", 5)).resolves.toBeNull();
    await cache.releaseLock("lock", token ?? "");
    await expect(cache.acquireLock("lock", 5)).resolves.toBeTruthy();
    await cache.del("state");
    await expect(cache.get("state")).resolves.toBeNull();
  });

  it("expires cached values and locks", async () => {
    vi.useFakeTimers();
    const cache = new InMemoryCache();
    await cache.set("short", "value", 1);
    expect(await cache.acquireLock("short-lock", 1)).toBeTruthy();
    vi.advanceTimersByTime(1_001);
    await expect(cache.get("short")).resolves.toBeNull();
    await expect(cache.acquireLock("short-lock", 1)).resolves.toBeTruthy();
  });

  it("maps public error messages without leaking internals", () => {
    expect(publicErrorMessage("STAKE_PAGE_TIMEOUT")).toContain("Stake");
    expect(publicErrorMessage("SPORTS_PROVIDER_RATE_LIMITED")).toContain(
      "proveedor deportivo",
    );
    expect(publicErrorMessage("MATCH_NOT_FOUND")).toContain("no encontrado");
    expect(publicErrorMessage("MATCH_NOT_PUBLISHED")).toContain("no publicado");
    expect(publicErrorMessage("LOCK_NOT_ACQUIRED")).toContain("operacion");
  });
});
