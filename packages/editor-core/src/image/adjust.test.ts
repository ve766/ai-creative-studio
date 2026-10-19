import { describe, expect, it } from "vitest";
import { createRaster, getPixel, hashRaster, setPixel, type RasterImage } from "../raster";
import { applyAdjustments, applyOpacity, denoise, sharpen } from "./adjust";

function expectCode(operation: () => unknown, code: string): void {
  try {
    operation();
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
    return;
  }
  throw new Error(`预期抛出 ${code}，但没有抛出任何错误`);
}

function fillPaint(image: RasterImage, rgba: [number, number, number, number]): void {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) setPixel(image, x, y, rgba);
  }
}

describe("applyOpacity", () => {
  it("不透明度 1 返回数值相同的独立副本", () => {
    const image = createRaster(2, 1);
    setPixel(image, 0, 0, [10, 20, 30, 255]);
    const result = applyOpacity(image, 1);
    expect(hashRaster(result)).toBe(hashRaster(image));
    expect(result).not.toBe(image);
  });

  it("按比例缩放 Alpha 通道", () => {
    const image = createRaster(3, 1);
    setPixel(image, 0, 0, [10, 20, 30, 255]);
    setPixel(image, 1, 0, [10, 20, 30, 1]);
    setPixel(image, 2, 0, [10, 20, 30, 0]);
    const result = applyOpacity(image, 0.5);
    expect(getPixel(result, 0, 0)).toEqual([10, 20, 30, 128]);
    expect(getPixel(result, 1, 0)).toEqual([10, 20, 30, 1]);
    expect(getPixel(result, 2, 0)).toEqual([10, 20, 30, 0]);
    expect(getPixel(image, 0, 0)).toEqual([10, 20, 30, 255]);
  });

  it("拒绝越界不透明度", () => {
    const image = createRaster(1, 1);
    expectCode(() => applyOpacity(image, 1.5), "INVALID_PARAM");
    expectCode(() => applyOpacity(image, -0.1), "INVALID_PARAM");
    expectCode(() => applyOpacity(image, Number.POSITIVE_INFINITY), "INVALID_PARAM");
  });
});

describe("applyAdjustments", () => {
  it("组合颜色调整与不透明度", () => {
    const image = createRaster(1, 1);
    setPixel(image, 0, 0, [200, 100, 50, 255]);
    const result = applyAdjustments(image, {
      opacity: 0.5,
      color: { saturation: -100 }
    });
    expect(getPixel(result, 0, 0)).toEqual([124, 124, 124, 128]);
  });

  it("默认参数返回等价图像", () => {
    const image = createRaster(2, 2);
    fillPaint(image, [12, 34, 56, 200]);
    expect(hashRaster(applyAdjustments(image))).toBe(hashRaster(image));
  });
});

describe("sharpen", () => {
  it("强度 0 时完全等价（默认关闭）", () => {
    const image = createRaster(4, 4);
    fillPaint(image, [100, 120, 140, 255]);
    expect(hashRaster(sharpen(image))).toBe(hashRaster(image));
    expect(hashRaster(sharpen(image, { amount: 0 }))).toBe(hashRaster(image));
  });

  it("常量区域不产生任何变化", () => {
    const image = createRaster(5, 5);
    fillPaint(image, [90, 90, 90, 128]);
    const result = sharpen(image, { amount: 80, radius: 1 });
    expect(getPixel(result, 2, 2)).toEqual([90, 90, 90, 128]);
    expect(hashRaster(result)).toBe(hashRaster(image));
  });

  it("单点亮点被增强（unsharp mask）", () => {
    const image = createRaster(3, 3);
    fillPaint(image, [0, 0, 0, 255]);
    setPixel(image, 1, 1, [100, 100, 100, 255]);
    const result = sharpen(image, { amount: 100, radius: 1 });
    const center = getPixel(result, 1, 1);
    expect(center[0]).toBeGreaterThan(100);
    expect(center[3]).toBe(255);
    expect(getPixel(result, 0, 0)).toEqual([0, 0, 0, 255]);
  });

  it("保留 Alpha 与半透明像素的解预乘结果", () => {
    const image = createRaster(3, 3);
    fillPaint(image, [100, 60, 20, 128]);
    const result = sharpen(image, { amount: 60, radius: 2 });
    expect(getPixel(result, 1, 1)).toEqual([100, 60, 20, 128]);
  });

  it("拒绝非法强度与半径", () => {
    const image = createRaster(2, 2);
    expectCode(() => sharpen(image, { amount: 101 }), "INVALID_PARAM");
    expectCode(() => sharpen(image, { radius: 0 }), "INVALID_PARAM");
  });
});

describe("denoise", () => {
  it("强度 0 时完全等价（默认关闭）", () => {
    const image = createRaster(4, 4);
    fillPaint(image, [40, 50, 60, 255]);
    expect(hashRaster(denoise(image))).toBe(hashRaster(image));
  });

  it("强度 100 时用中值移除孤立噪点", () => {
    const image = createRaster(3, 3);
    fillPaint(image, [10, 10, 10, 255]);
    setPixel(image, 1, 1, [255, 255, 255, 255]);
    const result = denoise(image, 100);
    expect(getPixel(result, 1, 1)).toEqual([10, 10, 10, 255]);
  });

  it("强度 50 时位于原值与中值之间", () => {
    const image = createRaster(3, 3);
    fillPaint(image, [10, 10, 10, 255]);
    setPixel(image, 1, 1, [255, 255, 255, 255]);
    const result = denoise(image, 50);
    expect(getPixel(result, 1, 1)).toEqual([133, 133, 133, 255]);
  });

  it("拒绝非法强度", () => {
    const image = createRaster(2, 2);
    expectCode(() => denoise(image, 101), "INVALID_PARAM");
  });
});
