import { describe, expect, it } from "vitest";
import type { AiJobRequest } from "@acs/ai-schema";
import {
  ProviderError,
  RateLimiter,
  realSleep,
  type RetryPolicy,
  type Sleeper
} from "@acs/cloud-core";
import { createMockAiProvider, type MockAiProviderOptions } from "./mock-provider";
import { createAiProviderRegistry } from "./registry";
import { createAiUsageLedger } from "./ledger";
import { createAiVerificationStore } from "./verification";
import { createAiJobService, toSnapshot } from "./jobs";
import type { AiProvider } from "./ports";

const noopSleep: Sleeper = () => Promise.resolve();

const CONTEXT = { ownerId: "user_1", projectId: "prj_1" };

function generate(overrides: Partial<AiJobRequest> = {}): AiJobRequest {
  return {
    capability: "image.generate",
    input: { prompt: "青花瓷纹样", size: { width: 1024, height: 1024 } },
    ...overrides
  };
}

interface SetupOptions {
  allowMock?: boolean;
  serviceAllowMock?: boolean;
  mock?: MockAiProviderOptions;
  providerSleep?: Sleeper;
  timeoutMs?: number;
  retry?: Partial<RetryPolicy>;
  rateLimiter?: RateLimiter;
  maxConcurrentPerOwner?: number;
  providers?: AiProvider[];
}

function setup(options: SetupOptions = {}) {
  const allowMock = options.allowMock ?? true;
  const mock = createMockAiProvider({
    latencyMs: options.mock?.latencyMs ?? 0,
    sleep: options.providerSleep ?? options.mock?.sleep ?? noopSleep,
    failWith: options.mock?.failWith,
    blockedTerms: options.mock?.blockedTerms,
    capabilities: options.mock?.capabilities
  });
  const registry = createAiProviderRegistry({
    allowMock,
    providers: options.providers ?? [mock]
  });
  const ledger = createAiUsageLedger();
  const verification = createAiVerificationStore();
  let clock = 0;
  const now = () => new Date(Date.parse("2026-10-18T00:00:00.000Z") + clock++ * 1_000).toISOString();
  const service = createAiJobService({
    registry,
    ledger,
    verification,
    allowMock: options.serviceAllowMock ?? allowMock,
    now,
    sleep: noopSleep,
    timeoutMs: options.timeoutMs,
    retry: options.retry,
    rateLimiter: options.rateLimiter,
    maxConcurrentPerOwner: options.maxConcurrentPerOwner
  });
  return { mock, ledger, verification, service, registry };
}

function heldSleep() {
  const pending: Array<() => void> = [];
  const sleep: Sleeper = () =>
    new Promise<void>((resolve) => {
      pending.push(resolve);
    });
  return {
    sleep,
    pending: () => pending.length,
    release: () => {
      for (const resolve of pending.splice(0)) resolve();
    }
  };
}

describe("AI job service", () => {
  it("completes a simulated job and records usage exactly once", async () => {
    const { service, ledger, verification, mock } = setup();
    const record = await service.submit(generate(), CONTEXT);

    expect(record.status).toBe("succeeded");
    expect(record.simulated).toBe(true);
    expect(record.mode).toBe("mock");
    expect(record.providerId).toBe("mock");
    expect(record.attempts).toBe(1);
    expect(record.result?.simulated).toBe(true);
    expect(record.requestSchemaVersion).toBe(1);
    expect(record.resultSchemaVersion).toBe(1);
    expect(record.startedAt).not.toBeNull();
    expect(record.finishedAt).not.toBeNull();
    expect(mock.__calls()).toBe(1);

    expect(ledger.list()).toHaveLength(1);
    expect(ledger.summarize()).toMatchObject({ tasks: 1, succeeded: 1, units: 1, costsAreSimulatedOnly: true });
    expect(verification.get("mock").verifiedAt).toBeNull();
    expect(verification.simulatedEvidence()).toHaveLength(1);
  });

  it("returns the same task for a repeated idempotency key without charging twice", async () => {
    const { service, ledger, mock } = setup();
    const first = await service.submit(generate({ idempotencyKey: "idem-1" }), CONTEXT);
    const second = await service.submit(generate({ idempotencyKey: "idem-1" }), CONTEXT);

    expect(second.taskId).toBe(first.taskId);
    expect(mock.__calls()).toBe(1);
    expect(ledger.list()).toHaveLength(1);
    expect(service.list()).toHaveLength(1);
  });

  it("retries transient failures and still records a single usage entry", async () => {
    const { service, ledger, mock } = setup({
      mock: { failWith: { code: "UPSTREAM_ERROR", times: 1 } },
      retry: { maxAttempts: 2 }
    });
    const record = await service.submit(generate(), CONTEXT);

    expect(record.status).toBe("succeeded");
    expect(record.attempts).toBe(2);
    expect(mock.__calls()).toBe(2);
    expect(ledger.list()).toHaveLength(1);
    expect(ledger.get(record.taskId)?.usage.amount).toBe(1);
    expect(ledger.summarize().tasks).toBe(1);
  });

  it("fails after exhausting retries and refunds the simulated usage", async () => {
    const { service, ledger } = setup({
      mock: { failWith: { code: "UPSTREAM_ERROR", times: 5 } },
      retry: { maxAttempts: 2 }
    });
    const record = await service.submit(generate(), CONTEXT);

    expect(record.status).toBe("failed");
    expect(record.error?.code).toBe("UPSTREAM_ERROR");
    expect(record.attempts).toBe(2);
    expect(ledger.list()).toHaveLength(1);
    const entry = ledger.get(record.taskId);
    expect(entry?.usage.amount).toBe(0);
    expect(entry?.usage.refunded).toBe(true);
    expect(entry?.usage.refundReason).toContain("未产生费用");
    expect(ledger.summarize()).toMatchObject({ tasks: 1, failed: 1, refunded: 1, units: 0 });
  });

  it("times out long running work and marks it timed-out", async () => {
    const { service, ledger } = setup({
      mock: { latencyMs: 200 },
      providerSleep: realSleep,
      timeoutMs: 20,
      retry: { maxAttempts: 1 }
    });
    const record = await service.submit(generate(), CONTEXT);

    expect(record.status).toBe("timed-out");
    expect(record.error?.code).toBe("TIMEOUT");
    expect(ledger.get(record.taskId)?.usage.refunded).toBe(true);
  });

  it("cancels a running job and reports it as canceled", async () => {
    const held = heldSleep();
    const { service, ledger, mock } = setup({ providerSleep: held.sleep });
    const pending = service.submit(generate(), CONTEXT);

    const taskId = service.list()[0]?.taskId ?? "";
    expect(taskId.startsWith("job_")).toBe(true);
    expect(service.list()[0]?.status).toBe("running");
    expect(service.cancel(taskId, "user_1")).toBe(true);

    const record = await pending;
    expect(record.status).toBe("canceled");
    expect(record.error?.code).toBe("CANCELED");
    expect(record.cancellationRequested).toBe(true);
    expect(mock.__calls()).toBe(1);
    expect(ledger.get(taskId)?.usage.refunded).toBe(true);
    expect(service.cancel(taskId, "user_1")).toBe(false);
  });

  it("refuses to cancel another owner's job", async () => {
    const held = heldSleep();
    const { service } = setup({ providerSleep: held.sleep });
    const pending = service.submit(generate(), CONTEXT);
    const taskId = service.list()[0]?.taskId ?? "";

    expect(service.cancel(taskId, "user_2")).toBe(false);
    held.release();
    expect((await pending).status).toBe("succeeded");
  });

  it("rejects invalid input before calling any provider", async () => {
    const { service, mock, ledger } = setup();
    await expect(
      service.submit({ capability: "image.generate", input: { prompt: "", size: { width: 1024, height: 1024 } } }, CONTEXT)
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      service.submit(
        {
          capability: "image.generate",
          input: { prompt: "ok", size: { width: 1024, height: 1024 }, style_preset: "vendor-only" }
        },
        CONTEXT
      )
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      service.submit(generate({ requestSchemaVersion: 99 }), CONTEXT)
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    expect(mock.__calls()).toBe(0);
    expect(service.list()).toHaveLength(0);
    expect(ledger.list()).toHaveLength(0);
  });

  it("rejects capabilities that are not implemented yet", async () => {
    const { service, mock } = setup();
    await expect(
      service.submit({ capability: "mesh.generate", input: { sourceAssetId: "asset_1" } }, CONTEXT)
    ).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    expect(mock.__calls()).toBe(0);
    expect(service.provides("mesh.generate")).toBe(false);
    expect(service.provides("image.generate")).toBe(true);
  });

  it("reports NOT_CONFIGURED when only mock implementations exist and mock is disabled", async () => {
    const { service } = setup({ allowMock: false });
    await expect(service.submit(generate(), CONTEXT)).rejects.toMatchObject({
      code: "NOT_CONFIGURED"
    });
  });

  it("refuses a mock provider even if the registry exposes it to a mock-disabled service", async () => {
    const { service } = setup({ allowMock: true, serviceAllowMock: false });
    await expect(service.submit(generate(), CONTEXT)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks concurrent submissions above the per owner limit", async () => {
    const held = heldSleep();
    const { service } = setup({ providerSleep: held.sleep, maxConcurrentPerOwner: 1 });
    const first = service.submit(generate(), CONTEXT);

    await expect(service.submit(generate(), CONTEXT)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(service.list()).toHaveLength(1);

    held.release();
    expect((await first).status).toBe("succeeded");
  });

  it("applies the rate limiter before creating a job", async () => {
    const rateLimiter = new RateLimiter({ capacity: 1, refillPerSecond: 0.001 });
    const { service, ledger } = setup({ rateLimiter });
    const first = await service.submit(generate(), CONTEXT);

    await expect(service.submit(generate(), CONTEXT)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterSeconds: 60
    });
    expect(service.list()).toHaveLength(1);
    expect(service.get(first.taskId)?.status).toBe("succeeded");
    expect(ledger.list()).toHaveLength(1);
  });

  it("never exposes internal bookkeeping in the client snapshot", async () => {
    const { service } = setup();
    const record = await service.submit(generate({ idempotencyKey: "idem-snapshot" }), CONTEXT);
    const snapshot = toSnapshot(record);

    expect(Object.keys(snapshot)).not.toContain("ownerId");
    expect(Object.keys(snapshot)).not.toContain("idempotencyKey");
    expect(JSON.stringify(snapshot)).not.toContain("sk-");
    expect(snapshot.usage?.actualCost).toBeNull();
  });

  it("propagates provider errors with their error code", async () => {
    const { service } = setup({ mock: { blockedTerms: ["违禁"] } });
    const record = await service.submit(
      generate({ input: { prompt: "违禁内容", size: { width: 512, height: 512 } } }),
      CONTEXT
    );
    expect(record.status).toBe("failed");
    expect(record.error?.code).toBe("CONTENT_REJECTED");
    expect(record.error?.retryable).toBe(false);
  });

  it("stops tracking jobs once the history limit is reached", async () => {
    const { service } = setup();
    const service2 = createAiJobService({
      registry: createAiProviderRegistry({ allowMock: true, providers: [createMockAiProvider()] }),
      ledger: createAiUsageLedger(),
      verification: createAiVerificationStore(),
      allowMock: true,
      sleep: noopSleep,
      historyLimit: 1
    });
    await service2.submit(generate(), CONTEXT);
    await service2.submit(generate(), CONTEXT);
    expect(service2.list()).toHaveLength(1);
    expect(service.list()).toHaveLength(0);
  });

  it("returns null for unknown task ids", () => {
    const { service } = setup();
    expect(service.get("job_missing")).toBeNull();
  });

  it("uses ProviderError for unsupported capabilities from the registry", () => {
    const provider: AiProvider = {
      id: "live-only",
      mode: "live",
      capabilities: ["image.generate"],
      describeConfiguration: () => ({ mode: "configured", missing: [] }),
      run: () => {
        throw new Error("not used");
      }
    };
    const registry = createAiProviderRegistry({ allowMock: true, providers: [provider] });
    expect(() => registry.resolve("image.remove-background")).toThrow(ProviderError);
  });
});
