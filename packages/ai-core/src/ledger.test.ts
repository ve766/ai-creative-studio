import { describe, expect, it } from "vitest";
import type { AiUsage } from "@acs/ai-schema";
import { createAiUsageLedger } from "./ledger";

function usage(overrides: Partial<AiUsage> = {}): AiUsage {
  return {
    unit: "image",
    amount: 1,
    simulated: true,
    estimatedCost: { kind: "estimated", currency: "USD", minorUnits: 0, basis: "模拟不计费" },
    actualCost: null,
    refunded: false,
    refundReason: null,
    ...overrides
  };
}

const base = {
  ownerId: "user_1",
  projectId: "prj_1",
  providerId: "mock",
  capability: "image.generate" as const,
  mode: "mock" as const,
  status: "succeeded" as const,
  attempts: 1
};

describe("AI usage ledger", () => {
  it("records a task once even if retries call it again", () => {
    const ledger = createAiUsageLedger();
    const first = ledger.recordOnce({ ...base, taskId: "job_1", usage: usage() });
    const second = ledger.recordOnce({ ...base, taskId: "job_1", usage: usage() });
    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);
    expect(ledger.list()).toHaveLength(1);
    expect(ledger.summarize().units).toBe(1);
  });

  it("marks failed and canceled tasks as refunded", () => {
    const ledger = createAiUsageLedger();
    ledger.recordOnce({
      ...base,
      taskId: "job_2",
      status: "canceled",
      usage: usage({ amount: 0, refunded: true, refundReason: "任务在完成前被取消，未产生费用" })
    });
    const refunded = ledger.refund("job_2", "任务在完成前被取消，未产生费用");
    expect(refunded?.usage.refunded).toBe(true);
    expect(ledger.get("job_2")?.usage.refundReason).toContain("取消");
    expect(ledger.summarize()).toMatchObject({ tasks: 1, canceled: 1, refunded: 1, units: 0 });
  });

  it("keeps estimated and actual costs apart and flags simulated-only totals", () => {
    const ledger = createAiUsageLedger();
    ledger.recordOnce({ ...base, taskId: "job_3", usage: usage() });
    expect(ledger.summarize()).toMatchObject({
      estimatedCostMinorUnits: 0,
      actualCostMinorUnits: 0,
      costsAreSimulatedOnly: true,
      simulatedTasks: 1
    });

    ledger.recordOnce({
      ...base,
      taskId: "job_4",
      providerId: "openai",
      mode: "live",
      status: "succeeded",
      usage: usage({
        simulated: false,
        estimatedCost: { kind: "estimated", currency: "USD", minorUnits: 40, basis: "按供应商公开价估算" },
        actualCost: { kind: "actual", currency: "USD", minorUnits: 41, source: "供应商用量回执" }
      })
    });
    const summary = ledger.summarize();
    expect(summary.costsAreSimulatedOnly).toBe(false);
    expect(summary.estimatedCostMinorUnits).toBe(40);
    expect(summary.actualCostMinorUnits).toBe(41);
  });

  it("never invents an actual cost for simulated tasks", () => {
    const ledger = createAiUsageLedger();
    ledger.recordOnce({ ...base, taskId: "job_5", usage: usage() });
    expect(ledger.list()[0]?.usage.actualCost).toBeNull();
    expect(ledger.summarize().actualCostMinorUnits).toBe(0);
  });

  it("exposes lookup helpers and trims to the retention limit", () => {
    const ledger = createAiUsageLedger({ limit: 2 });
    ledger.recordOnce({ ...base, taskId: "job_a", usage: usage() });
    ledger.recordOnce({ ...base, taskId: "job_b", usage: usage() });
    ledger.recordOnce({ ...base, taskId: "job_c", usage: usage() });
    expect(ledger.has("job_a")).toBe(false);
    expect(ledger.has("job_c")).toBe(true);
    expect(ledger.list()).toHaveLength(2);
    expect(ledger.summarize().tasks).toBe(2);
  });

  it("returns null when refunding an unknown task", () => {
    const ledger = createAiUsageLedger();
    expect(ledger.refund("job_missing", "无记录")).toBeNull();
    expect(ledger.get("job_missing")).toBeNull();
  });
});
