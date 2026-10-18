import type { ApiErrorCode } from "@acs/cloud-schema";
import { ProviderError, toProviderError } from "./errors";

export const DEFAULT_TIMEOUT_MS = 15_000;

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 2_000
};

export type Sleeper = (ms: number) => Promise<void>;

export const realSleep: Sleeper = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export function backoffDelay(attempt: number, policy: RetryPolicy): number {
  const exponential = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(exponential, policy.maxDelayMs);
}

export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ProviderError("TIMEOUT", `操作超时（${timeoutMs}ms）`));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY,
  sleep: Sleeper = realSleep
): Promise<T> {
  let lastError: ProviderError | null = null;
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      const providerError = toProviderError(error);
      lastError = providerError;
      if (!providerError.retryable || attempt === policy.maxAttempts) throw providerError;
      await sleep(backoffDelay(attempt, policy));
    }
  }
  throw lastError ?? new ProviderError("INTERNAL", "未知错误");
}

export interface ProviderCallOptions {
  timeoutMs?: number;
  retry?: Partial<RetryPolicy>;
  sleep?: Sleeper;
}

export async function callProvider<T>(
  operation: (signal: AbortSignal, attempt: number) => Promise<T>,
  options: ProviderCallOptions = {}
): Promise<T> {
  const policy: RetryPolicy = { ...DEFAULT_RETRY, ...options.retry };
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return withRetry(
    (attempt) => withTimeout((signal) => operation(signal, attempt), timeoutMs),
    policy,
    options.sleep
  );
}

export interface RateLimiterOptions {
  capacity: number;
  refillPerSecond: number;
  now?: () => number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class RateLimiter {
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: RateLimiterOptions) {
    if (options.capacity < 1) throw new Error("capacity 必须 ≥ 1");
    if (options.refillPerSecond <= 0) throw new Error("refillPerSecond 必须 > 0");
    this.capacity = options.capacity;
    this.refillPerSecond = options.refillPerSecond;
    this.now = options.now ?? (() => Date.now());
  }

  tryAcquire(key: string, cost = 1): boolean {
    if (cost < 1) return true;
    const timestamp = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: timestamp };
    const elapsedSeconds = Math.max(0, (timestamp - bucket.updatedAt) / 1000);
    const refilled = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond);
    if (refilled < cost) {
      this.buckets.set(key, { tokens: refilled, updatedAt: timestamp });
      return false;
    }
    this.buckets.set(key, { tokens: refilled - cost, updatedAt: timestamp });
    return true;
  }

  peek(key: string): number {
    const bucket = this.buckets.get(key);
    return bucket ? bucket.tokens : this.capacity;
  }

  reset(): void {
    this.buckets.clear();
  }
}

export interface UsageEntry {
  provider: string;
  operation: string;
  success: boolean;
  units?: number;
  costMinorUnits?: number | null;
  errorCode?: ApiErrorCode | null;
  at?: string;
}

export interface UsageRecord {
  provider: string;
  operation: string;
  success: boolean;
  units: number;
  costMinorUnits: number;
  errorCode: ApiErrorCode | null;
  at: string;
}

export interface UsageSummary {
  calls: number;
  failures: number;
  units: number;
  costMinorUnits: number;
}

export class UsageRecorder {
  private readonly records: UsageRecord[] = [];
  private readonly limit: number;
  private readonly clock: () => string;

  constructor(limit = 500, clock: () => string = () => new Date().toISOString()) {
    this.limit = limit;
    this.clock = clock;
  }

  record(entry: UsageEntry): void {
    this.records.push({
      provider: entry.provider,
      operation: entry.operation,
      success: entry.success,
      units: entry.units ?? 1,
      costMinorUnits: entry.costMinorUnits ?? 0,
      errorCode: entry.errorCode ?? null,
      at: entry.at ?? this.clock()
    });
    if (this.records.length > this.limit) this.records.shift();
  }

  list(): readonly UsageRecord[] {
    return this.records;
  }

  summarize(): UsageSummary {
    return this.records.reduce<UsageSummary>(
      (total, record) => ({
        calls: total.calls + 1,
        failures: total.failures + (record.success ? 0 : 1),
        units: total.units + record.units,
        costMinorUnits: total.costMinorUnits + record.costMinorUnits
      }),
      { calls: 0, failures: 0, units: 0, costMinorUnits: 0 }
    );
  }
}

export type ProviderMode = "configured" | "not-configured" | "mock";

export interface ProviderConfig {
  mode: ProviderMode;
  missing: string[];
}

export function describeProviderConfig(
  required: readonly string[],
  env: Record<string, string | undefined>,
  options: { mock?: boolean } = {}
): ProviderConfig {
  if (options.mock) return { mode: "mock", missing: [] };
  const missing = required.filter((name) => {
    const value = env[name];
    return value === undefined || value.trim().length === 0;
  });
  if (missing.length > 0) return { mode: "not-configured", missing };
  return { mode: "configured", missing: [] };
}
