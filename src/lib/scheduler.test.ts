import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { yieldToMain } from "./scheduler";

describe("yieldToMain", () => {
  const originalScheduler = (globalThis as { scheduler?: unknown }).scheduler;
  const originalSetTimeout = globalThis.setTimeout;

  beforeEach(() => {
    delete (globalThis as { scheduler?: unknown }).scheduler;
  });

  afterEach(() => {
    (globalThis as { scheduler?: unknown }).scheduler = originalScheduler;
    globalThis.setTimeout = originalSetTimeout;
  });

  it("usa setTimeout cuando scheduler.yield no existe", async () => {
    const spy = vi.spyOn(globalThis, "setTimeout");
    await yieldToMain();
    expect(spy).toHaveBeenCalled();
  });

  it("usa scheduler.yield cuando esta disponible", async () => {
    const yieldMock = vi.fn().mockResolvedValue(undefined);
    (globalThis as { scheduler?: { yield: () => Promise<void> } }).scheduler = {
      yield: yieldMock,
    };
    await yieldToMain();
    expect(yieldMock).toHaveBeenCalledOnce();
  });
});
