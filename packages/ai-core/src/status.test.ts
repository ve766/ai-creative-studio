import { describe, expect, it } from "vitest";
import type { AiCapability } from "@acs/ai-schema";
import { createMockAiProvider } from "./mock-provider";
import { createAiProviderRegistry } from "./registry";
import { createAiVerificationStore } from "./verification";
import { describeAiServiceStatus } from "./status";
import type { AiProvider } from "./ports";

interface LiveOptions {
  id?: string;
  capabilities?: readonly AiCapability[];
  configured?: boolean;
  missing?: string[];
}

function liveProvider(options: LiveOptions = {}): AiProvider {
  const missing = options.missing ?? [];
  return {
    id: options.id ?? "openai",
    mode: "live",
    capabilities: options.capabilities ?? ["image.generate"],
    describeConfiguration: () => ({
      mode: options.configured === false ? "not-configured" : missing.length > 0 ? "not-configured" : "configured",
      missing
    }),
    run: () => {
      throw new Error("测试替身不应被调用");
    }
  };
}

function registryOf(providers: AiProvider[], allowMock: boolean) {
  return createAiProviderRegistry({ allowMock, providers });
}

describe("AI service status", () => {
  const verification = createAiVerificationStore();

  it("reports not-configured with the missing variable names when AI is off", () => {
    const status = describeAiServiceStatus({
      requestedMode: "off",
      registry: registryOf([createMockAiProvider()], false),
      verification,
      allowMock: false,
      missing: ["AI_IMAGE_PROVIDER", "AI_IMAGE_API_KEY"],
      checkedAt: "2026-10-18T00:00:00.000Z"
    });
    expect(status.state).toBe("not-configured");
    expect(status.providerId).toBeNull();
    expect(status.missing).toEqual(["AI_IMAGE_PROVIDER", "AI_IMAGE_API_KEY"]);
    expect(status.simulatedCapabilities).toEqual([]);
    expect(status.plannedCapabilities).toEqual(["mesh.generate"]);
  });

  it("reports simulated mode with the simulated capability list", () => {
    const status = describeAiServiceStatus({
      requestedMode: "mock",
      registry: registryOf([createMockAiProvider()], true),
      verification,
      allowMock: true,
      missing: []
    });
    expect(status.state).toBe("simulated");
    expect(status.simulatedCapabilities).toContain("image.generate");
    expect(status.problems.join()).toContain("模拟");
    expect(status.verification.verifiedAt).toBeNull();
  });

  it("refuses simulated mode in a production-like environment", () => {
    const status = describeAiServiceStatus({
      requestedMode: "mock",
      registry: registryOf([createMockAiProvider()], false),
      verification,
      allowMock: false,
      missing: []
    });
    expect(status.state).toBe("not-configured");
    expect(status.simulatedCapabilities).toEqual([]);
    expect(status.problems.join()).toContain("禁止模拟 Provider");
  });

  it("never reports configured credentials as verified", () => {
    const status = describeAiServiceStatus({
      requestedMode: "live",
      registry: registryOf([liveProvider()], false),
      verification,
      allowMock: false,
      missing: []
    });
    expect(status.state).toBe("unverified");
    expect(status.verification.verifiedAt).toBeNull();
    expect(status.problems.join()).toContain("尚无成功的真实调用记录");
  });

  it("reports verified only after a recorded live success", () => {
    const store = createAiVerificationStore();
    store.recordLiveSuccess({
      providerId: "openai",
      capability: "image.generate",
      at: "2026-10-18T00:00:00.000Z",
      latencyMs: 1_200,
      model: "gpt-image-1",
      detail: "返回 1 张 1024x1024 图"
    });
    const status = describeAiServiceStatus({
      requestedMode: "live",
      registry: registryOf([liveProvider()], false),
      verification: store,
      allowMock: false,
      missing: [],
      checkedAt: "2026-10-18T00:10:00.000Z"
    });
    expect(status.state).toBe("verified");
    expect(status.verification.verifiedAt).toBe("2026-10-18T00:00:00.000Z");
    expect(status.verification.evidence).toContain("gpt-image-1");
  });

  it("reports temporary unavailability after a newer failure", () => {
    const store = createAiVerificationStore();
    store.recordLiveSuccess({
      providerId: "openai",
      capability: "image.generate",
      at: "2026-10-18T00:00:00.000Z",
      latencyMs: 800,
      model: null,
      detail: "首次验证成功"
    });
    store.recordFailure({
      providerId: "openai",
      code: "UPSTREAM_ERROR",
      at: "2026-10-18T01:00:00.000Z",
      message: "上游 500"
    });
    const status = describeAiServiceStatus({
      requestedMode: "live",
      registry: registryOf([liveProvider()], false),
      verification: store,
      allowMock: false,
      missing: [],
      checkedAt: "2026-10-18T01:05:00.000Z"
    });
    expect(status.state).toBe("unavailable");
    expect(status.problems.join()).toContain("UPSTREAM_ERROR");
  });

  it("lists the missing credentials when a live provider is declared but unconfigured", () => {
    const status = describeAiServiceStatus({
      requestedMode: "live",
      registry: registryOf([liveProvider({ missing: ["AI_IMAGE_API_KEY"] })], false),
      verification,
      allowMock: false,
      missing: ["AI_IMAGE_API_KEY"]
    });
    expect(status.state).toBe("not-configured");
    expect(status.missing).toEqual(["AI_IMAGE_API_KEY"]);
    expect(status.problems.join()).toContain("AI_IMAGE_API_KEY");
  });

  it("does not treat simulated successes as verification", () => {
    const store = createAiVerificationStore();
    store.recordSimulatedSuccess({
      providerId: "openai",
      capability: "image.generate",
      at: "2026-10-18T00:00:00.000Z"
    });
    const status = describeAiServiceStatus({
      requestedMode: "live",
      registry: registryOf([liveProvider()], false),
      verification: store,
      allowMock: false,
      missing: []
    });
    expect(status.state).toBe("unverified");
  });
});
