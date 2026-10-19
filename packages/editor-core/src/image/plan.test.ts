import { describe, expect, it } from "vitest";
import { createRaster, getPixel, hashRaster, setPixel } from "../raster";
import { buildOutputReport, buildSizeReport, describeAspect, inspectDimensions, inspectOutput, simplifyAspect } from "./inspect";
import { cropImage, cropImageClamped, resizeImage } from "./ops";

function expectCode(operation: () => unknown, code: string): void {
  try {
    operation();
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
    return;
  }
  throw new Error(`预期抛出 ${code}，但没有抛出任何错误`);
}

function paint(width: number, height: number): ReturnType<typeof createRaster> {
  const image = createRaster(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setPixel(image, x, y, [(x * 7) % 256, (y * 11) % 256, 128, 255]);
    }
  }
  return image;
}

describe("cropImage", () => {
  it("按归一化区域裁切并给出内容指纹", () => {
    const image = paint(10, 8);
    const before = hashRaster(image);
    const result = cropImage(image, { x: 2, y: 1, width: 4, height: 3 });
    expect(result.rect).toEqual({ x: 2, y: 1, width: 4, height: 3 });
    expect(result.image.width).toBe(4);
    expect(result.image.height).toBe(3);
    expect(getPixel(result.image, 0, 0)).toEqual(getPixel(image, 2, 1));
    expect(result.contentHash).toBe(hashRaster(result.image));
    expect(hashRaster(image)).toBe(before);
  });

  it("拒绝越界区域", () => {
    expectCode(() => cropImage(paint(4, 4), { x: 2, width: 4, height: 2 }), "INVALID_PARAM");
  });

  it("clamped 版本自动收缩而不抛错", () => {
    const result = cropImageClamped(paint(4, 4), { x: 3, y: 3, width: 10, height: 10 });
    expect(result.rect).toEqual({ x: 3, y: 3, width: 1, height: 1 });
  });
});

describe("resizeImage", () => {
  it("同尺寸时不做重采样且指纹不变", () => {
    const image = paint(16, 8);
    const result = resizeImage(image, { mode: "exact", width: 16, height: 8 });
    expect(result.resampled).toBe(false);
    expect(result.image).toBe(image);
    expect(result.contentHash).toBe(hashRaster(image));
  });

  it("fit-max-edge 缩小后重新编码指纹", () => {
    const image = paint(64, 32);
    const result = resizeImage(image, { mode: "fit-max-edge", maxEdge: 16 });
    expect(result.resampled).toBe(true);
    expect(result.image.width).toBe(16);
    expect(result.image.height).toBe(8);
    expect(result.plan.capped).toBe(true);
  });

  it("字符串模式被拒绝", () => {
    expectCode(
      () => resizeImage(paint(4, 4), { mode: "zoom" as never }),
      "INVALID_PARAM"
    );
  });
});

describe("describeAspect / simplifyAspect", () => {
  it("识别常见比例", () => {
    expect(describeAspect(300, 300)).toBe("1:1");
    expect(describeAspect(1600, 900)).toBe("16:9");
    expect(describeAspect(1600, 1200)).toBe("4:3");
    expect(describeAspect(900, 1600)).toBe("16:9");
  });

  it("公约数可约时给出整数比", () => {
    expect(simplifyAspect(20, 10)).toBe("2:1");
    expect(simplifyAspect(30, 20)).toBe("3:2");
  });

  it("无法约分时给出三位小数比", () => {
    expect(simplifyAspect(1000, 997)).toBe("1.003:1");
    expect(describeAspect(200, 74)).toBe("2.703:1");
  });
});

describe("inspectOutput", () => {
  it("计算有效分辨率与所需像素", () => {
    const image = paint(3000, 1500);
    const info = inspectOutput(image, { widthMm: 254, dpi: 300 });
    expect(info.effectiveDpi).toBeCloseTo(300, 6);
    expect(info.requiredWidthPx).toBe(3000);
    expect(info.requiredHeightPx).toBe(1500);
    expect(info.meetsTargetDpi).toBe(true);
    expect(info.megapixels).toBeCloseTo(4.5, 6);
    expect(info.orientation).toBe("landscape");
    expect(info.aspectLabel).toBe("2:1");
  });

  it("竖图与方形正确分类", () => {
    expect(inspectOutput(paint(600, 900), { widthMm: 100, dpi: 300 }).orientation).toBe("portrait");
    expect(inspectOutput(paint(600, 600), { widthMm: 100, dpi: 300 }).orientation).toBe("square");
  });
});

describe("buildOutputReport", () => {
  it("分辨率不足时给出警告或错误等级", () => {
    const warning = buildOutputReport(paint(2000, 2000), { widthMm: 254, dpi: 300 });
    expect(warning.issues.find((issue) => issue.code === "LOW_EFFECTIVE_DPI")?.level).toBe("warning");
    const error = buildOutputReport(paint(1000, 1000), { widthMm: 254, dpi: 300 });
    const issue = error.issues.find((item) => item.code === "LOW_EFFECTIVE_DPI");
    expect(issue?.level).toBe("error");
    expect(issue?.message).toContain("3000px");
  });

  it("低于最低可接受 DPI 时报告错误", () => {
    const result = buildOutputReport(paint(1000, 1000), {
      widthMm: 254,
      dpi: 300,
      minimumDpi: 150
    });
    expect(result.issues.some((issue) => issue.code === "BELOW_MINIMUM_DPI")).toBe(true);
  });

  it("比例不匹配时给出提示", () => {
    const result = buildOutputReport(paint(600, 600), {
      widthMm: 100,
      heightMm: 200,
      dpi: 100,
      minimumDpi: 1
    });
    expect(result.issues.some((issue) => issue.code === "ASPECT_MISMATCH")).toBe(true);
  });

  it("满足目标时没有问题", () => {
    const result = buildOutputReport(paint(3000, 1500), {
      widthMm: 254,
      dpi: 300,
      minimumDpi: 150
    });
    expect(result.issues).toEqual([]);
    expect(result.info.meetsTargetDpi).toBe(true);
  });
});

describe("inspectDimensions / buildSizeReport", () => {
  it("只凭尺寸计算分辨率信息，无需像素数据", () => {
    const info = inspectDimensions({ width: 3000, height: 1500 }, { widthMm: 254, dpi: 300 });
    expect(info.effectiveDpi).toBeCloseTo(300, 6);
    expect(info.aspectLabel).toBe("2:1");
    expect(info.requiredWidthPx).toBe(3000);
    expect(info.meetsTargetDpi).toBe(true);
  });

  it("与 buildOutputReport 对同一尺寸给出一致的问题", () => {
    const spec = { widthMm: 254, dpi: 300, minimumDpi: 150 };
    const bySize = buildSizeReport({ width: 1000, height: 1000 }, spec);
    const byImage = buildOutputReport(paint(1000, 1000), spec);
    expect(bySize.issues).toEqual(byImage.issues);
  });

  it("尺寸不匹配时给出比例提示", () => {
    const result = buildSizeReport({ width: 600, height: 600 }, {
      widthMm: 100,
      heightMm: 200,
      dpi: 100,
      minimumDpi: 1
    });
    expect(result.issues.some((issue) => issue.code === "ASPECT_MISMATCH")).toBe(true);
  });
});
