import { describe, expect, it } from "vitest";
import { createRaster } from "../raster";
import {
  clampCropRect,
  normalizeAlphaThreshold,
  normalizeCropRect,
  normalizeDenoise,
  normalizeOpacity,
  normalizeOutputSpec,
  normalizeSharpen,
  planResize
} from "./params";

function expectCode(operation: () => unknown, code: string): void {
  try {
    operation();
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
    return;
  }
  throw new Error(`预期抛出 ${code}，但没有抛出任何错误`);
}

describe("normalizeCropRect", () => {
  const image = createRaster(100, 60);

  it("缺省起点为 0 且接受合法区域", () => {
    expect(normalizeCropRect(image, { width: 20, height: 10 })).toEqual({
      x: 0,
      y: 0,
      width: 20,
      height: 10
    });
  });

  it("拒绝超出边界", () => {
    expectCode(() => normalizeCropRect(image, { x: 90, width: 20, height: 10 }), "INVALID_PARAM");
    expectCode(() => normalizeCropRect(image, { width: 20, height: 61 }), "INVALID_PARAM");
  });

  it("拒绝非整数起点与非正尺寸", () => {
    expectCode(() => normalizeCropRect(image, { x: 1.5, width: 10, height: 10 }), "INVALID_PARAM");
    expectCode(() => normalizeCropRect(image, { width: 0, height: 10 }), "INVALID_PARAM");
  });
});

describe("clampCropRect", () => {
  const image = createRaster(100, 60);

  it("收缩到右边界与下边界", () => {
    expect(clampCropRect(image, { x: 80, y: 50, width: 40, height: 40 })).toEqual({
      x: 80,
      y: 50,
      width: 20,
      height: 10
    });
  });

  it("负起点被抬到 0", () => {
    expect(clampCropRect(image, { x: -30, y: -5, width: 10, height: 10 })).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 10
    });
  });

  it("起点落在图像之外时收缩为单像素", () => {
    expect(clampCropRect(image, { x: 200, y: 0, width: 10, height: 10 })).toEqual({
      x: 99,
      y: 0,
      width: 1,
      height: 10
    });
  });
});

describe("planResize", () => {
  const wide = createRaster(512, 256);

  it("fit-max-edge 限制最长边且不放大", () => {
    const plan = planResize(wide, { mode: "fit-max-edge", maxEdge: 128 });
    expect(plan).toMatchObject({
      width: 128,
      height: 64,
      capped: true,
      upscale: false
    });
    const untouched = planResize(createRaster(64, 32), { mode: "fit-max-edge", maxEdge: 128 });
    expect(untouched).toMatchObject({ width: 64, height: 32, capped: false, upscale: false });
  });

  it("exact 在超过像素上限时按比例缩小并说明原因", () => {
    const plan = planResize(createRaster(100, 100), {
      mode: "exact",
      width: 200,
      height: 200,
      maxPixels: 2500
    });
    expect(plan.width).toBe(50);
    expect(plan.height).toBe(50);
    expect(plan.capped).toBe(true);
    expect(plan.reason).toContain("像素上限");
  });

  it("print 按 mm 与 DPI 计算像素并保留宽高比", () => {
    const plan = planResize(createRaster(1000, 500), { mode: "print", widthMm: 254, dpi: 300 });
    expect(plan.width).toBe(3000);
    expect(plan.height).toBe(1500);
    expect(plan.upscale).toBe(true);
    expect(plan.reason).toContain("254mm @ 300dpi");
  });

  it("拒绝非法模式与非法数值", () => {
    expectCode(
      () => planResize(wide, { mode: "unknown" as never }),
      "INVALID_PARAM"
    );
    expectCode(
      () => planResize(wide, { mode: "fit-max-edge", maxEdge: Number.NaN }),
      "INVALID_PARAM"
    );
    expectCode(() => planResize(wide, { mode: "print", widthMm: -1, dpi: 300 }), "INVALID_PARAM");
  });
});

describe("参数归一化", () => {
  it("不透明度限制在 0-1", () => {
    expect(normalizeOpacity(0.5)).toBe(0.5);
    expectCode(() => normalizeOpacity(1.2), "INVALID_PARAM");
    expectCode(() => normalizeOpacity(Number.NaN), "INVALID_PARAM");
  });

  it("锐化默认关闭且半径有限", () => {
    expect(normalizeSharpen()).toEqual({ amount: 0, radius: 1 });
    expectCode(() => normalizeSharpen({ amount: 101 }), "INVALID_PARAM");
    expectCode(() => normalizeSharpen({ radius: 4 }), "INVALID_PARAM");
  });

  it("去噪默认 0（关闭）", () => {
    expect(normalizeDenoise()).toEqual({ strength: 0 });
    expectCode(() => normalizeDenoise(-1), "INVALID_PARAM");
  });

  it("透明阈值默认 16 且不允许 0 或 255", () => {
    expect(normalizeAlphaThreshold()).toEqual({ threshold: 16 });
    expectCode(() => normalizeAlphaThreshold(0), "INVALID_PARAM");
    expectCode(() => normalizeAlphaThreshold(255), "INVALID_PARAM");
  });

  it("输出规格默认最低 DPI 为 min(dpi, 150)", () => {
    expect(normalizeOutputSpec({ widthMm: 100, dpi: 300 })).toEqual({
      widthMm: 100,
      heightMm: null,
      dpi: 300,
      minimumDpi: 150
    });
    expect(normalizeOutputSpec({ widthMm: 100, dpi: 100 }).minimumDpi).toBe(100);
    expectCode(() => normalizeOutputSpec({ widthMm: 0, dpi: 300 }), "INVALID_PARAM");
  });
});
