import { describe, expect, it } from "vitest";
import type { AiCapability, AiProviderMode } from "@acs/ai-schema";
import { createMockAiProvider } from "./mock-provider";
import { createAiProviderRegistry } from "./registry";
import type { AiProvider } from "./ports";

function liveProvider(id: string, capabilities: AiCapability[], configured = true): AiProvider {
  return {
    id,
    mode: "live",
    capabilities,
    describeConfiguration: () => ({ mode: configured ? "configured" : "not-configured", missing: [] }),
    run: () => {
      throw new Error("测试替身不应被调用");
    }
  };
}

describe("AI provider registry", () => {
  it("resolves live providers ahead of mock providers", () => {
    const registry = createAiProviderRegistry({
      allowMock: true,
      providers: [createMockAiProvider({ id: "mock" }), liveProvider("openai", ["image.generate"])]
    });
    expect(registry.resolve("image.generate").id).toBe("openai");
    expect(registry.implFor("image.generate")).toBe<AiProviderMode>("live");
  });

  it("falls back to the mock provider when no live provider covers the capability", () => {
    const registry = createAiProviderRegistry({
      allowMock: true,
      providers: [createMockAiProvider({ id: "mock" }), liveProvider("openai", ["image.generate"])]
    });
    expect(registry.resolve("image.seamless-tile").id).toBe("mock");
    expect(registry.implFor("image.remove-background")).toBe<AiProviderMode>("mock");
  });

  it("throws NOT_SUPPORTED when no provider declares the capability", () => {
    const registry = createAiProviderRegistry({
      allowMock: true,
      providers: [createMockAiProvider({ id: "mock", capabilities: ["image.generate"] })]
    });
    expect(() => registry.resolve("mesh.generate")).toThrowError(/NOT_SUPPORTED|不得|尚无/u);
    expect(registry.implFor("mesh.generate")).toBeNull();
  });

  it("hides mock providers and reports NOT_CONFIGURED when mock is disallowed", () => {
    const registry = createAiProviderRegistry({
      allowMock: false,
      providers: [createMockAiProvider({ id: "mock" })]
    });
    expect(registry.find("image.generate")).toBeNull();
    expect(registry.list()).toHaveLength(0);
    expect(registry.descriptors()).toHaveLength(1);
    try {
      registry.resolve("image.generate");
      throw new Error("应当抛出错误");
    } catch (error) {
      expect(error).toMatchObject({ code: "NOT_CONFIGURED" });
    }
  });

  it("rejects duplicate provider ids", () => {
    expect(() =>
      createAiProviderRegistry({
        allowMock: true,
        providers: [createMockAiProvider({ id: "same" }), liveProvider("same", ["image.generate"])]
      })
    ).toThrowError(/重复/u);
  });

  it("exposes capability and configuration descriptors without leaking credentials", () => {
    const registry = createAiProviderRegistry({
      allowMock: true,
      providers: [
        { ...liveProvider("openai", ["image.generate"], false), describeConfiguration: () => ({ mode: "not-configured", missing: ["AI_IMAGE_API_KEY"] }) }
      ]
    });
    const descriptors = registry.descriptors();
    expect(descriptors[0]?.id).toBe("openai");
    expect(descriptors[0]?.configuration.missing).toEqual(["AI_IMAGE_API_KEY"]);
    expect(JSON.stringify(descriptors)).not.toContain("sk-");
  });
});
