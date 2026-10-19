import { describe, expect, it } from "vitest";
import { AI_SERVICE_STATES, AI_SERVICE_STATE_LABELS, AiServiceStatusSchema } from "./status";

function baseStatus() {
  return {
    state: "not-configured" as const,
    requestedMode: "off" as const,
    providerId: null,
    implementedCapabilities: ["image.generate"],
    plannedCapabilities: ["mesh.generate"],
    simulatedCapabilities: [],
    verification: {
      verifiedAt: null,
      evidence: null,
      lastFailureAt: null,
      lastFailureCode: null
    },
    missing: ["AI_IMAGE_PROVIDER", "AI_IMAGE_API_KEY"],
    problems: ["AI 图像生成未配置"],
    checkedAt: "2026-10-18T00:00:00.000Z"
  };
}

describe("AI service status", () => {
  it("labels every state in Chinese", () => {
    for (const state of AI_SERVICE_STATES) {
      expect(AI_SERVICE_STATE_LABELS[state].length).toBeGreaterThan(0);
    }
  });

  it("accepts a plain unconfigured status", () => {
    expect(AiServiceStatusSchema.safeParse(baseStatus()).success).toBe(true);
  });

  it("refuses to report verified without a real verification record", () => {
    const parsed = AiServiceStatusSchema.safeParse({
      ...baseStatus(),
      state: "verified",
      requestedMode: "live",
      providerId: "openai"
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses to report verified while running in mock mode", () => {
    const parsed = AiServiceStatusSchema.safeParse({
      ...baseStatus(),
      state: "verified",
      requestedMode: "mock",
      providerId: "mock",
      verification: {
        verifiedAt: "2026-10-18T00:00:00.000Z",
        evidence: "mock 自检",
        lastFailureAt: null,
        lastFailureCode: null
      }
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts verified with concrete evidence", () => {
    const parsed = AiServiceStatusSchema.safeParse({
      ...baseStatus(),
      state: "verified",
      requestedMode: "live",
      providerId: "openai",
      missing: [],
      problems: [],
      verification: {
        verifiedAt: "2026-10-18T00:00:00.000Z",
        evidence: "image.generate 成功返回 1 张 512x512 图（耗时 2140ms）",
        lastFailureAt: null,
        lastFailureCode: null
      }
    });
    expect(parsed.success).toBe(true);
  });

  it("requires simulated capabilities to be declared in simulated mode", () => {
    expect(
      AiServiceStatusSchema.safeParse({ ...baseStatus(), state: "simulated", requestedMode: "mock" }).success
    ).toBe(false);
    expect(
      AiServiceStatusSchema.safeParse({
        ...baseStatus(),
        state: "simulated",
        requestedMode: "mock",
        providerId: "mock",
        simulatedCapabilities: ["image.generate"],
        problems: ["开发模拟模式：结果不是真实 AI 输出"]
      }).success
    ).toBe(true);
  });

  it("describes unverified configuration without claiming success", () => {
    const parsed = AiServiceStatusSchema.safeParse({
      ...baseStatus(),
      state: "unverified",
      requestedMode: "live",
      providerId: "openai",
      missing: [],
      problems: ["已配置 openai，但尚无成功的真实调用记录"]
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.verification.verifiedAt).toBeNull();
      expect(parsed.data.state).not.toBe("verified");
    }
  });

  it("describes temporary unavailability with the last failure", () => {
    const parsed = AiServiceStatusSchema.safeParse({
      ...baseStatus(),
      state: "unavailable",
      requestedMode: "live",
      providerId: "openai",
      verification: {
        verifiedAt: "2026-10-17T00:00:00.000Z",
        evidence: "历史验证成功",
        lastFailureAt: "2026-10-18T00:00:00.000Z",
        lastFailureCode: "RATE_LIMITED"
      }
    });
    expect(parsed.success).toBe(true);
  });
});
