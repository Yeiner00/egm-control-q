import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiRateLimitError, resetAiRateLimitState, runAiTask } from "@/lib/aiRateLimit";

describe("runAiTask", () => {
  beforeEach(() => {
    resetAiRateLimitState();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAiRateLimitState();
  });

  it("serializes AI tasks", async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;

    const first = runAiTask(async () => {
      order.push("first:start");
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      order.push("first:end");
      return 1;
    }, { minRequestIntervalMs: 0 });

    const second = runAiTask(async () => {
      order.push("second:start");
      return 2;
    }, { minRequestIntervalMs: 0 });

    await Promise.resolve();
    expect(order).toEqual(["first:start"]);

    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(order).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("waits for the configured cooldown before the next task", async () => {
    vi.useFakeTimers();
    const statuses: string[] = [];

    await runAiTask(async () => "first", { minRequestIntervalMs: 1000 });

    const second = runAiTask(async () => "second", {
      minRequestIntervalMs: 1000,
      onStatus: (status) => statuses.push(status.status),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(statuses).toContain("waiting");

    await vi.advanceTimersByTimeAsync(999);
    let resolved = false;
    second.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(second).resolves.toBe("second");
  });

  it("stops locally when the daily request limit is reached", async () => {
    await runAiTask(async () => "first", {
      minRequestIntervalMs: 0,
      dailyRequestLimit: 1,
    });

    await expect(runAiTask(async () => "second", {
      minRequestIntervalMs: 0,
      dailyRequestLimit: 1,
    })).rejects.toBeInstanceOf(AiRateLimitError);
  });

  it("retries rate limit errors up to the configured maximum", async () => {
    vi.useFakeTimers();
    let calls = 0;

    const result = runAiTask(async () => {
      calls += 1;
      if (calls < 3) {
        throw new AiRateLimitError("limited", 5);
      }
      return "ok";
    }, {
      minRequestIntervalMs: 0,
      retryDelaysMs: [5, 5],
    });

    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe("ok");
    expect(calls).toBe(3);
  });
});
