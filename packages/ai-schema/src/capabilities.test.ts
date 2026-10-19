import { describe, expect, it } from "vitest";
import {
  AI_CAPABILITIES,
  AI_CAPABILITY_LABELS,
  IMPLEMENTED_CAPABILITIES,
  MAX_IMAGE_EDGE,
  PLANNED_CAPABILITIES,
  AiRequestSchema,
  describeAiRequest,
  isImplementedCapability
} from "./capabilities";

describe("AI capability contract", () => {
  it("labels every declared capability", () => {
    for (const capability of AI_CAPABILITIES) {
      expect(AI_CAPABILITY_LABELS[capability].length).toBeGreaterThan(0);
    }
  });

  it("separates implemented from planned capabilities without overlap", () => {
    for (const capability of PLANNED_CAPABILITIES) {
      expect(isImplementedCapability(capability)).toBe(false);
    }
    for (const capability of IMPLEMENTED_CAPABILITIES) {
      expect(AI_CAPABILITIES).toContain(capability);
      expect(PLANNED_CAPABILITIES).not.toContain(capability);
    }
  });

  it("accepts a valid generation request and applies defaults", () => {
    const parsed = AiRequestSchema.parse({
      capability: "image.generate",
      prompt: "青花瓷纹样",
      size: { width: 1024, height: 1024 }
    });
    expect(parsed.capability).toBe("image.generate");
    if (parsed.capability !== "image.generate") throw new Error("unreachable");
    expect(parsed.transparent).toBe(false);
    expect(parsed.seed).toBeUndefined();
  });

  it("rejects empty and over-long prompts", () => {
    const base = { capability: "image.generate", size: { width: 512, height: 512 } };
    expect(AiRequestSchema.safeParse({ ...base, prompt: "   " }).success).toBe(false);
    expect(AiRequestSchema.safeParse({ ...base, prompt: "x".repeat(1001) }).success).toBe(false);
  });

  it("rejects oversized images and pixel budgets above the cap", () => {
    const base = { capability: "image.generate", prompt: "ok" };
    expect(
      AiRequestSchema.safeParse({ ...base, size: { width: MAX_IMAGE_EDGE + 1, height: 512 } }).success
    ).toBe(false);
    expect(
      AiRequestSchema.safeParse({ ...base, size: { width: maxEdge(), height: maxEdge() } }).success
    ).toBe(false);
    expect(
      AiRequestSchema.safeParse({ ...base, size: { width: MAX_IMAGE_EDGE, height: 4096 } }).success
    ).toBe(false);
    expect(
      AiRequestSchema.safeParse({ ...base, size: { width: 4000, height: 4000 } }).success
    ).toBe(true);
    expect(
      AiRequestSchema.safeParse({ ...base, size: { width: 32, height: 32 } }).success
    ).toBe(false);
  });

  it("rejects vendor specific fields instead of silently accepting them", () => {
    const parsed = AiRequestSchema.safeParse({
      capability: "image.generate",
      prompt: "ok",
      size: { width: 512, height: 512 },
      style_preset: "vendor-sd-xl"
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects capability specific payloads that miss required fields", () => {
    expect(
      AiRequestSchema.safeParse({ capability: "image.edit", prompt: "改一下" }).success
    ).toBe(false);
    expect(
      AiRequestSchema.safeParse({ capability: "image.upscale", sourceAssetId: "a_1" }).success
    ).toBe(false);
  });

  it("describes every capability with a human readable summary", () => {
    const requests = [
      AiRequestSchema.parse({ capability: "image.generate", prompt: "p", size: { width: 512, height: 512 } }),
      AiRequestSchema.parse({
        capability: "image.edit",
        prompt: "p",
        sourceAssetId: "a_1",
        size: { width: 512, height: 512 }
      }),
      AiRequestSchema.parse({ capability: "image.remove-background", sourceAssetId: "a_1" }),
      AiRequestSchema.parse({
        capability: "image.seamless-tile",
        prompt: "p",
        size: { width: 512, height: 512 }
      }),
      AiRequestSchema.parse({
        capability: "image.product-scene",
        sourceAssetId: "a_1",
        scenePreset: "studio-white",
        size: { width: 512, height: 512 }
      }),
      AiRequestSchema.parse({ capability: "mesh.generate", sourceAssetId: "a_1" })
    ];
    for (const request of requests) {
      expect(describeAiRequest(request).length).toBeGreaterThan(0);
    }
  });
});

function maxEdge(): number {
  return MAX_IMAGE_EDGE;
}
