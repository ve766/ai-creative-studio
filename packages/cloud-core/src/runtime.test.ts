import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "./errors";
import {
  DEFAULT_RETRY,
  RateLimiter,
  UsageRecorder,
  backoffDelay,
  callProvider,
  describeProviderConfig,
  withRetry,
  withTimeout
} from "./runtime";

describe("backoffDelay", () => {
  it("grows exponentially and never exceeds the cap", () => {
    const policy = { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 250 };
    expect(backoffDelay(1, policy)).toBe(100);
    expect(backoffDelay(2, policy)).toBe(200);
    expect(backoffDelay(3, policy)).toBe(250);
    expect(backoffDelay(10, policy)).toBe(250);
  });
});

describe("withTimeout", () => {
  it("rejects with TIMEOUT when the operation is too slow", async () => {
    await expect(
      withTimeout(() => new Promise(() => undefined), 20)
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("aborts the signal it handed to the operation", async () => {
    let aborted = false;
    await expect(
      withTimeout(
        (signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              aborted = true;
              reject(new ProviderError("INTERNAL", "aborted"));
            });
          }),
        20
      )
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(aborted).toBe(true);
  });

  it("returns the value when the operation finishes in time", async () => {
    await expect(withTimeout(async () => "ok", 100)).resolves.toBe("ok");
  });
});

describe("withRetry", () => {
  it("retries retryable failures and succeeds", async () => {
    const sleep = vi.fn(async () => undefined);
    let attempts = 0;
    const result = await withRetry(
      async (attempt) => {
        attempts = attempt;
        if (attempt < 3) throw new ProviderError("UPSTREAM_ERROR", "上游抖动");
        return "done";
      },
      DEFAULT_RETRY,
      sleep
    );
    expect(result).toBe("done");
    expect(attempts).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable failures", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new ProviderError("VALIDATION_FAILED", "参数错误");
        },
        DEFAULT_RETRY,
        sleep
      )
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after maxAttempts and rethrows the last provider error", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new ProviderError("TIMEOUT", "还是超时");
        },
        { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2 },
        sleep
      )
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(2);
  });

  it("wraps non-provider errors as INTERNAL", async () => {
    await expect(
      withRetry(async () => {
        throw new Error("boom");
      }, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 })
    ).rejects.toMatchObject({ code: "INTERNAL", message: "boom" });
  });
});

describe("callProvider", () => {
  it("combines timeout and retry with an injected sleeper", async () => {
    let calls = 0;
    const value = await callProvider(
      async () => {
        calls += 1;
        if (calls === 1) throw new ProviderError("RATE_LIMITED", "限流");
        return "ok";
      },
      { timeoutMs: 100, retry: { maxAttempts: 2 }, sleep: async () => undefined }
    );
    expect(value).toBe("ok");
    expect(calls).toBe(2);
  });
});

describe("RateLimiter", () => {
  it("consumes tokens and refills over time", () => {
    let clock = 0;
    const limiter = new RateLimiter({ capacity: 2, refillPerSecond: 1, now: () => clock });
    expect(limiter.tryAcquire("user_a")).toBe(true);
    expect(limiter.tryAcquire("user_a")).toBe(true);
    expect(limiter.tryAcquire("user_a")).toBe(false);
    clock = 1000;
    expect(limiter.tryAcquire("user_a")).toBe(true);
    expect(limiter.peek("user_a")).toBeCloseTo(0, 5);
  });

  it("isolates buckets per key", () => {
    const limiter = new RateLimiter({ capacity: 1, refillPerSecond: 1 });
    expect(limiter.tryAcquire("a")).toBe(true);
    expect(limiter.tryAcquire("a")).toBe(false);
    expect(limiter.tryAcquire("b")).toBe(true);
  });

  it("rejects invalid configuration", () => {
    expect(() => new RateLimiter({ capacity: 0, refillPerSecond: 1 })).toThrow();
    expect(() => new RateLimiter({ capacity: 1, refillPerSecond: 0 })).toThrow();
  });
});

describe("UsageRecorder", () => {
  it("records, summarizes and trims to the limit", () => {
    const recorder = new UsageRecorder(2, () => "2026-10-18T00:00:00.000Z");
    recorder.record({ provider: "p", operation: "generate", success: true, units: 2, costMinorUnits: 10 });
    recorder.record({ provider: "p", operation: "generate", success: false, errorCode: "TIMEOUT" });
    recorder.record({ provider: "p", operation: "generate", success: true });
    expect(recorder.list()).toHaveLength(2);
    expect(recorder.list()[1]?.at).toBe("2026-10-18T00:00:00.000Z");
    const summary = recorder.summarize();
    expect(summary.calls).toBe(2);
    expect(summary.failures).toBe(1);
    expect(summary.units).toBe(2);
  });
});

describe("describeProviderConfig", () => {
  it("reports missing variables without inventing configuration", () => {
    const config = describeProviderConfig(["A", "B"], { A: "x", B: "  " });
    expect(config.mode).toBe("not-configured");
    expect(config.missing).toEqual(["B"]);
  });

  it("is configured only when every required variable is present", () => {
    expect(describeProviderConfig(["A", "B"], { A: "x", B: "y" }).mode).toBe("configured");
  });

  it("can be pinned to mock mode explicitly", () => {
    expect(describeProviderConfig(["A"], {}, { mock: true })).toEqual({ mode: "mock", missing: [] });
  });
});
