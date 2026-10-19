import { describe, expect, it } from "vitest";
import { AlgorithmError } from "../errors";
import {
  createRaster,
  getPixel,
  hashRaster,
  setPixel,
  type RasterImage
} from "../raster";
import { fillGradient } from "../fixtures";
import { makeSeamless, measureSeam, measureSeams } from "./seamless";

function horizontalGradient(width = 32, height = 16): RasterImage {
  const image = createRaster(width, height);
  fillGradient(image, { from: [0, 0, 0], to: [255, 255, 255], axis: "x" });
  return image;
}

describe("measureSeam", () => {
  it("detects a horizontal wrap discontinuity in a horizontal gradient", () => {
    const report = measureSeam(horizontalGradient(), "horizontal");
    expect(report.axis).toBe("horizontal");
    expect(report.pairs).toBe(16);
    expect(report.meanDelta).toBeGreaterThan(180);
    expect(report.maxDelta).toBe(255);
    expect(measureSeams(horizontalGradient()).vertical.meanDelta).toBe(0);
  });

  it("reports zero for a seamless gradient (matching edges)", () => {
    const image = createRaster(8, 8);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const value = x < 4 ? x : 7 - x;
        setPixel(image, x, y, [value * 30, 0, 0, 255]);
      }
    }
    expect(measureSeam(image, "horizontal").maxDelta).toBeLessThanOrEqual(30);
  });

  it("rejects images smaller than 2x2", () => {
    expect(() => measureSeam(createRaster(1, 4), "horizontal")).toThrow(AlgorithmError);
  });
});

describe("makeSeamless", () => {
  it("returns an unchanged copy when blending is disabled", () => {
    const source = horizontalGradient();
    const result = makeSeamless(source, { axis: "horizontal", blend: "none" });
    expect(hashRaster(result.image)).toBe(hashRaster(source));
    expect(result.image.data).not.toBe(source.data);
    expect(result.bandX).toBe(0);
  });

  it("removes the wrap discontinuity at the boundary while keeping the size", () => {
    const source = horizontalGradient();
    const before = measureSeam(source, "horizontal");
    const result = makeSeamless(source, { axis: "horizontal", blend: "medium" });
    const after = measureSeam(result.image, "horizontal");
    expect(result.image.width).toBe(source.width);
    expect(result.image.height).toBe(source.height);
    expect(after.meanDelta).toBeLessThan(before.meanDelta);
    expect(after.maxDelta).toBeLessThan(before.maxDelta);
    expect(getPixel(result.image, 0, 5)).toEqual(getPixel(result.image, source.width - 1, 5));
  });

  it("handles both axes and is deterministic", () => {
    const source = horizontalGradient();
    const first = makeSeamless(source, { axis: "both", blend: "soft" });
    const second = makeSeamless(source, { axis: "both", blend: "soft" });
    expect(hashRaster(first.image)).toBe(hashRaster(second.image));
    const reports = measureSeams(first.image);
    expect(reports.horizontal.maxDelta).toBeLessThan(measureSeams(source).horizontal.maxDelta);
    expect(first.bandY).toBeGreaterThan(0);
  });

  it("does not mutate the source image", () => {
    const source = horizontalGradient();
    const before = hashRaster(source);
    makeSeamless(source, { axis: "both", blend: "strong" });
    expect(hashRaster(source)).toBe(before);
  });

  it("rejects unknown axes and blend strengths", () => {
    const source = horizontalGradient();
    expect(() => makeSeamless(source, { axis: "diagonal" as "horizontal" })).toThrow(/接缝方向/u);
    expect(() => makeSeamless(source, { blend: "extreme" as "soft" })).toThrow(/融合强度/u);
  });
});
