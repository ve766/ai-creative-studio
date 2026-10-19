import { describe, expect, it } from "vitest";
import {
  AiJobRecordSchema,
  AiJobRequestSchema,
  AiJobSnapshotSchema,
  AiResultAssetSchema,
  AiUsageSchema,
  isTerminalStatus,
  toJobSnapshot,
  type AiJobRecord
} from "./jobs";

function buildRecord(overrides: Partial<AiJobRecord> = {}): AiJobRecord {
  return {
    taskId: "job_1",
    ownerId: "user_1",
    projectId: null,
    capability: "image.generate",
    providerId: "mock",
    mode: "mock",
    simulated: true,
    status: "succeeded",
    attempts: 1,
    idempotencyKey: "idem-1",
    requestSchemaVersion: 1,
    resultSchemaVersion: 1,
    createdAt: "2026-10-18T00:00:00.000Z",
    startedAt: "2026-10-18T00:00:00.000Z",
    finishedAt: "2026-10-18T00:00:01.000Z",
    result: {
      kind: "inline-data-url",
      reference: "data:image/svg+xml;base64,PHN2Zy8+",
      mimeType: "image/svg+xml",
      width: 512,
      height: 512,
      byteSize: 128,
      checksum: null,
      simulated: true
    },
    model: "mock-placeholder-v1",
    usage: {
      unit: "image",
      amount: 1,
      simulated: true,
      estimatedCost: { kind: "estimated", currency: "USD", minorUnits: 0, basis: "模拟模式不计费" },
      actualCost: null,
      refunded: false,
      refundReason: null
    },
    error: null,
    cancellationRequested: false,
    ...overrides
  };
}

describe("AI task states", () => {
  it("treats only terminal statuses as finished", () => {
    expect(isTerminalStatus("queued")).toBe(false);
    expect(isTerminalStatus("running")).toBe(false);
    expect(isTerminalStatus("succeeded")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("canceled")).toBe(true);
    expect(isTerminalStatus("timed-out")).toBe(true);
  });
});

describe("AI result assets", () => {
  it("accepts inline simulated output and media references", () => {
    expect(
      AiResultAssetSchema.safeParse({
        kind: "inline-data-url",
        reference: "data:image/png;base64,AAAA",
        mimeType: "image/png",
        width: null,
        height: null,
        byteSize: null,
        checksum: null,
        simulated: true
      }).success
    ).toBe(true);
    expect(
      AiResultAssetSchema.safeParse({
        kind: "storage-key",
        reference: "ai/user_1/job_1/out.png",
        mimeType: "image/png",
        width: 512,
        height: 512,
        byteSize: 1024,
        checksum: "sha256:abc",
        simulated: false
      }).success
    ).toBe(true);
  });

  it("rejects mismatched reference kinds", () => {
    const base = {
      mimeType: "image/png",
      width: null,
      height: null,
      byteSize: null,
      checksum: null,
      simulated: false
    };
    expect(
      AiResultAssetSchema.safeParse({ ...base, kind: "inline-data-url", reference: "https://x/y.png" }).success
    ).toBe(false);
    expect(
      AiResultAssetSchema.safeParse({ ...base, kind: "storage-key", reference: "https://x/y.png" }).success
    ).toBe(false);
    expect(
      AiResultAssetSchema.safeParse({ ...base, kind: "remote-url", reference: "http://x/y.png" }).success
    ).toBe(false);
  });
});

describe("AI usage and cost", () => {
  it("keeps estimated and actual cost separate", () => {
    const parsed = AiUsageSchema.parse({
      unit: "image",
      amount: 2,
      simulated: true,
      estimatedCost: { kind: "estimated", currency: "USD", minorUnits: 40, basis: "按 0.04 美元/张估算" },
      actualCost: null,
      refunded: false,
      refundReason: null
    });
    expect(parsed.estimatedCost?.minorUnits).toBe(40);
    expect(parsed.actualCost).toBeNull();
  });

  it("requires a source for actual cost so bills are never invented", () => {
    expect(
      AiUsageSchema.safeParse({
        unit: "image",
        amount: 1,
        simulated: false,
        estimatedCost: null,
        actualCost: { kind: "actual", currency: "USD", minorUnits: 12 },
        refunded: false,
        refundReason: null
      }).success
    ).toBe(false);
  });

  it("records cancel and refund state", () => {
    const parsed = AiUsageSchema.parse({
      unit: "image",
      amount: 1,
      simulated: false,
      estimatedCost: null,
      actualCost: null,
      refunded: true,
      refundReason: "任务在完成前被取消"
    });
    expect(parsed.refunded).toBe(true);
    expect(parsed.refundReason).toContain("取消");
  });
});

describe("AI job records", () => {
  it("validates a complete record", () => {
    expect(AiJobRecordSchema.safeParse(buildRecord()).success).toBe(true);
  });

  it("keeps internal bookkeeping fields out of the client snapshot", () => {
    const snapshot = toJobSnapshot(buildRecord());
    expect(snapshot.taskId).toBe("job_1");
    expect(Object.keys(snapshot)).not.toContain("ownerId");
    expect(Object.keys(snapshot)).not.toContain("idempotencyKey");
    expect(AiJobSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("rejects unknown top level request payload", () => {
    expect(
      AiJobRequestSchema.safeParse({
        capability: "image.generate",
        input: { prompt: "p" },
        apiKey: "sk-leak"
      }).success
    ).toBe(false);
    expect(
      AiJobRequestSchema.safeParse({
        capability: "image.generate",
        input: { prompt: "p" },
        idempotencyKey: "abc"
      }).success
    ).toBe(true);
  });

  it("rejects an unknown status value", () => {
    expect(AiJobRecordSchema.safeParse(buildRecord({ status: "pending" as never })).success).toBe(false);
  });
});
