import { describe, expect, it } from "vitest";
import { AiRequestSchema } from "@acs/ai-schema";
import { createMockAiProvider, MOCK_MODEL_ID } from "./mock-provider";
import type { AiRunContext } from "./ports";

const generateRequest = AiRequestSchema.parse({
  capability: "image.generate",
  prompt: "青花瓷纹样",
  size: { width: 1024, height: 1024 }
});

const tileRequest = AiRequestSchema.parse({
  capability: "image.seamless-tile",
  prompt: "亚麻纹理",
  size: { width: 512, height: 512 }
});

function context(overrides: Partial<AiRunContext> = {}): AiRunContext {
  return {
    taskId: "job_test",
    ownerId: "user_1",
    projectId: null,
    attempt: 1,
    signal: new AbortController().signal,
    ...overrides
  };
}

describe("mock AI provider", () => {
  it("reports itself as a mock provider, never as a live service", () => {
    const provider = createMockAiProvider();
    expect(provider.mode).toBe("mock");
    expect(provider.describeConfiguration()).toEqual({ mode: "mock", missing: [] });
  });

  it("marks every result and usage record as simulated", async () => {
    const provider = createMockAiProvider();
    const outcome = await provider.run(generateRequest, context());
    expect(outcome.asset.simulated).toBe(true);
    expect(outcome.asset.reference.startsWith("data:image/svg+xml")).toBe(true);
    expect(outcome.asset.mimeType).toBe("image/svg+xml");
    expect(outcome.asset.width).toBe(1024);
    expect(outcome.model).toBe(MOCK_MODEL_ID);
    expect(outcome.usage.simulated).toBe(true);
    expect(outcome.usage.actualCost).toBeNull();
    expect(outcome.usage.estimatedCost?.minorUnits).toBe(0);
    expect(outcome.usage.estimatedCost?.basis).toContain("模拟");
  });

  it("labels the placeholder image as simulated so it cannot pass for real output", async () => {
    const provider = createMockAiProvider();
    const outcome = await provider.run(generateRequest, context());
    const svg = decodeURIComponent(outcome.asset.reference.replace("data:image/svg+xml;charset=utf-8,", ""));
    expect(svg).toContain("SIMULATED");
    expect(svg).toContain("模拟输出");
  });

  it("is deterministic for the same request", async () => {
    const first = await createMockAiProvider().run(tileRequest, context());
    const second = await createMockAiProvider().run(tileRequest, context());
    expect(first.asset.reference).toBe(second.asset.reference);
    expect(first.asset.checksum).toBe(second.asset.checksum);
  });

  it("refuses capabilities it does not declare", async () => {
    const provider = createMockAiProvider({ capabilities: ["image.generate"] });
    await expect(provider.run(tileRequest, context())).rejects.toMatchObject({
      code: "NOT_SUPPORTED"
    });
  });

  it("rejects blocked content without returning an image", async () => {
    const provider = createMockAiProvider({ blockedTerms: ["违规"] });
    const request = AiRequestSchema.parse({
      capability: "image.generate",
      prompt: "违规内容",
      size: { width: 512, height: 512 }
    });
    await expect(provider.run(request, context())).rejects.toMatchObject({
      code: "CONTENT_REJECTED"
    });
  });

  it("supports injected failures for reliability tests", async () => {
    const provider = createMockAiProvider({
      failWith: { code: "UPSTREAM_ERROR", times: 1, message: "模拟上游故障" }
    });
    await expect(provider.run(generateRequest, context())).rejects.toMatchObject({
      code: "UPSTREAM_ERROR"
    });
    const outcome = await provider.run(generateRequest, context());
    expect(outcome.asset.simulated).toBe(true);
    expect(provider.__calls()).toBe(2);
  });

  it("stops work when the caller cancels", async () => {
    const controller = new AbortController();
    const provider = createMockAiProvider({
      latencyMs: 50,
      sleep: () =>
        new Promise<void>((_resolve, reject) => {
          controller.signal.addEventListener(
            "abort",
            () => reject(new Error("sleep aborted")),
            { once: true }
          );
        })
    });
    const pending = provider.run(generateRequest, context({ signal: controller.signal }));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "CANCELED" });
  });

  it("reports progress stages prefixed as mock work", async () => {
    const stages: string[] = [];
    const provider = createMockAiProvider();
    await provider.run(generateRequest, context({ onProgress: (progress) => stages.push(progress.stage) }));
    expect(stages).toEqual(["mock-run", "mock-render", "mock-done"]);
  });
});
