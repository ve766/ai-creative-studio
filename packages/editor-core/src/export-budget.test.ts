import { describe, expect, it } from "vitest";
import { DEFAULT_EXPORT_LIMITS, planExport } from "./export-budget";

describe("export budget planning", () => {
  it("exports previews at native canvas resolution", () => {
    const result = planExport({ canvasWidth: 1600, canvasHeight: 680, mode: "preview" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.pixelRatio).toBe(1);
    expect(result.plan.outputWidth).toBe(1600);
    expect(result.plan.outputHeight).toBe(680);
    expect(result.plan.capped).toBe(false);
    expect(result.plan.warning).toBeNull();
  });

  it("targets the requested print DPI when it fits the budget", () => {
    const result = planExport({
      canvasWidth: 1600,
      canvasHeight: 680,
      mode: "print",
      targetWidthMm: 200,
      targetDpi: 300
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.requestedWidthPx).toBe(2363);
    expect(result.plan.outputWidth).toBe(Math.floor(1600 * (2363 / 1600)));
    expect(result.plan.capped).toBe(false);
    expect(result.plan.effectiveDpi).toBeCloseTo(
      (result.plan.outputWidth / 200) * 25.4,
      3
    );
  });

  it("never exceeds the maximum print scale", () => {
    const result = planExport({
      canvasWidth: 100,
      canvasHeight: 100,
      mode: "print",
      targetWidthMm: 500,
      targetDpi: 600
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.pixelRatio).toBe(4);
    expect(result.plan.outputWidth).toBe(400);
    expect(result.plan.outputHeight).toBe(400);
  });

  it("caps output inside the pixel budget and explains why", () => {
    const result = planExport({
      canvasWidth: 2100,
      canvasHeight: 2100,
      mode: "print",
      targetWidthMm: 420,
      targetDpi: 300
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.capped).toBe(true);
    expect(result.plan.outputPixels).toBeLessThanOrEqual(DEFAULT_EXPORT_LIMITS.maxPixels);
    expect(result.plan.outputWidth).toBeLessThanOrEqual(DEFAULT_EXPORT_LIMITS.maxDimension);
    expect(result.plan.warning).toContain("像素上限");
    expect(result.plan.warning).toContain("不适合直接送印");
    expect(result.plan.effectiveDpi).toBeLessThan(300);
  });

  it("honours custom limits", () => {
    const result = planExport({
      canvasWidth: 1000,
      canvasHeight: 1000,
      mode: "print",
      targetWidthMm: 200,
      targetDpi: 300,
      limits: { maxPixels: 4_000_000, maxDimension: 8192 }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.capped).toBe(true);
    expect(result.plan.outputWidth).toBe(2000);
    expect(result.plan.outputPixels).toBeLessThanOrEqual(4_000_000);
  });

  it("refuses instead of silently downscaling below the canvas resolution", () => {
    const result = planExport({
      canvasWidth: 2000,
      canvasHeight: 2000,
      mode: "preview",
      limits: { maxPixels: 1_000_000, maxDimension: 8192 }
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("2000×2000");
    expect(result.message).toContain("无法");
  });
  it("rejects an invalid canvas", () => {
    expect(planExport({ canvasWidth: 0, canvasHeight: 100, mode: "preview" }).ok).toBe(false);
    expect(planExport({ canvasWidth: 100, canvasHeight: -5, mode: "preview" }).ok).toBe(false);
  });

  it("falls back to native resolution for print without a valid target", () => {
    const result = planExport({
      canvasWidth: 800,
      canvasHeight: 600,
      mode: "print",
      targetWidthMm: 0,
      targetDpi: 300
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.pixelRatio).toBe(1);
    expect(result.plan.effectiveDpi).toBeNull();
  });
});
