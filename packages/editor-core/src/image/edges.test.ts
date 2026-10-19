import { describe, expect, it } from "vitest";
import { createRaster, getPixel, hashRaster, setPixel, type RasterImage } from "../raster";
import { analyzeTransparentEdges, cleanAlphaFringe, trimTransparentEdges } from "./edges";

function borderedImage(): RasterImage {
  const image = createRaster(6, 5);
  for (let y = 1; y < 4; y += 1) {
    for (let x = 2; x < 4; x += 1) {
      setPixel(image, x, y, [10, 20, 30, 255]);
    }
  }
  return image;
}

function expectCode(operation: () => unknown, code: string): void {
  try {
    operation();
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
    return;
  }
  throw new Error(`预期抛出 ${code}，但没有抛出任何错误`);
}

describe("analyzeTransparentEdges", () => {
  it("全不透明图像没有可裁切边缘", () => {
    const image = createRaster(4, 4);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) setPixel(image, x, y, [1, 2, 3, 255]);
    }
    const report = analyzeTransparentEdges(image);
    expect(report).toMatchObject({ top: 0, right: 0, bottom: 0, left: 0, opaqueRatio: 1 });
    expect(report.entirelyTransparent).toBe(false);
  });

  it("识别四边透明边距", () => {
    const report = analyzeTransparentEdges(borderedImage());
    expect(report).toMatchObject({ top: 1, right: 2, bottom: 1, left: 2 });
    expect(report.entirelyTransparent).toBe(false);
  });

  it("低于阈值的半透明像素视为透明", () => {
    const image = createRaster(3, 1);
    setPixel(image, 0, 0, [0, 0, 0, 10]);
    setPixel(image, 1, 0, [0, 0, 0, 100]);
    setPixel(image, 2, 0, [0, 0, 0, 0]);
    expect(analyzeTransparentEdges(image, { threshold: 16 })).toMatchObject({ left: 1, right: 1 });
    expect(analyzeTransparentEdges(image, { threshold: 5 })).toMatchObject({ left: 0, right: 1 });
  });

  it("全透明图像不报告边距并标记 entirelyTransparent", () => {
    const image = createRaster(5, 5);
    const report = analyzeTransparentEdges(image);
    expect(report.entirelyTransparent).toBe(true);
    expect(report).toMatchObject({ top: 0, right: 0, bottom: 0, left: 0, opaqueRatio: 0 });
    expect(report.fullyTransparentPixels).toBe(25);
  });
});

describe("trimTransparentEdges", () => {
  it("裁掉四边透明区域且不修改源图", () => {
    const image = borderedImage();
    const before = hashRaster(image);
    const result = trimTransparentEdges(image);
    expect(result.changed).toBe(true);
    expect(result.image.width).toBe(2);
    expect(result.image.height).toBe(3);
    expect(getPixel(result.image, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(hashRaster(image)).toBe(before);
    expect(result.report).toMatchObject({ left: 2, right: 2, top: 1, bottom: 1 });
  });

  it("无需裁切时返回原对象且 changed 为 false", () => {
    const image = createRaster(2, 2);
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 2; x += 1) setPixel(image, x, y, [9, 9, 9, 255]);
    }
    const result = trimTransparentEdges(image);
    expect(result.changed).toBe(false);
    expect(result.image).toBe(image);
  });

  it("全透明图像保持不变", () => {
    const image = createRaster(3, 3);
    const result = trimTransparentEdges(image);
    expect(result.changed).toBe(false);
    expect(result.image).toBe(image);
  });
});

describe("cleanAlphaFringe", () => {
  it("清除阈值以下的半透明像素并计数", () => {
    const image = createRaster(4, 1);
    setPixel(image, 0, 0, [200, 100, 50, 10]);
    setPixel(image, 1, 0, [200, 100, 50, 16]);
    setPixel(image, 2, 0, [200, 100, 50, 17]);
    setPixel(image, 3, 0, [200, 100, 50, 0]);
    const result = cleanAlphaFringe(image, { threshold: 16 });
    expect(result.clearedPixels).toBe(2);
    expect(getPixel(result.image, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(getPixel(result.image, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(getPixel(result.image, 2, 0)).toEqual([200, 100, 50, 17]);
    expect(getPixel(result.image, 3, 0)).toEqual([200, 100, 50, 0]);
  });

  it("不修改源图并拒绝非法阈值", () => {
    const image = createRaster(2, 1);
    setPixel(image, 0, 0, [1, 2, 3, 5]);
    const before = hashRaster(image);
    cleanAlphaFringe(image, { threshold: 16 });
    expect(hashRaster(image)).toBe(before);
    expectCode(() => cleanAlphaFringe(image, { threshold: 0 }), "INVALID_PARAM");
  });
});
