import { describe, expect, it } from "vitest";
import { AI_STATUS_VERIFICATION_TTL_MS } from "@acs/ai-schema";
import { createAiVerificationStore, wasVerificationSupersededByFailure } from "./verification";

describe("AI verification store", () => {
  it("only records live calls as verified evidence", () => {
    const store = createAiVerificationStore();
    store.recordLiveSuccess({
      providerId: "openai",
      capability: "image.generate",
      at: "2026-10-18T10:00:00.000Z",
      latencyMs: 1_840,
      model: "gpt-image-1",
      detail: "image.generate 返回 1 张 1024x1024 图"
    });
    const summary = store.toSummary("openai", { now: "2026-10-18T10:05:00.000Z" });
    expect(summary.verifiedAt).toBe("2026-10-18T10:00:00.000Z");
    expect(summary.evidence).toContain("gpt-image-1");
  });

  it("never marks a provider verified from simulated calls", () => {
    const store = createAiVerificationStore();
    store.recordSimulatedSuccess({
      providerId: "openai",
      capability: "image.generate",
      at: "2026-10-18T10:00:00.000Z"
    });
    expect(store.toSummary("openai", { now: "2026-10-18T10:05:00.000Z" }).verifiedAt).toBeNull();
    expect(store.simulatedEvidence()).toHaveLength(1);
  });

  it("keeps the last failure without erasing earlier verification", () => {
    const store = createAiVerificationStore();
    store.recordLiveSuccess({
      providerId: "openai",
      capability: "image.generate",
      at: "2026-10-18T09:00:00.000Z",
      latencyMs: 900,
      model: null,
      detail: "首次真实验证成功"
    });
    store.recordFailure({
      providerId: "openai",
      code: "RATE_LIMITED",
      at: "2026-10-18T11:00:00.000Z",
      message: "供应商限流"
    });
    const summary = store.toSummary("openai", { now: "2026-10-18T11:05:00.000Z" });
    expect(summary.verifiedAt).toBe("2026-10-18T09:00:00.000Z");
    expect(summary.lastFailureCode).toBe("RATE_LIMITED");
    expect(wasVerificationSupersededByFailure(summary)).toBe(true);
  });

  it("treats expired verification as unverified", () => {
    const store = createAiVerificationStore();
    store.recordLiveSuccess({
      providerId: "openai",
      capability: "image.generate",
      at: "2026-10-01T00:00:00.000Z",
      latencyMs: 900,
      model: null,
      detail: "很久以前的验证"
    });
    const now = new Date(Date.parse("2026-10-01T00:00:00.000Z") + AI_STATUS_VERIFICATION_TTL_MS + 1).toISOString();
    const summary = store.toSummary("openai", { now });
    expect(summary.verifiedAt).toBeNull();
    expect(summary.evidence).toBeNull();
  });

  it("returns an empty summary for unknown providers", () => {
    const store = createAiVerificationStore();
    expect(store.toSummary("never-seen")).toEqual({
      verifiedAt: null,
      evidence: null,
      lastFailureAt: null,
      lastFailureCode: null
    });
    expect(wasVerificationSupersededByFailure(store.toSummary("never-seen"))).toBe(false);
  });
});
