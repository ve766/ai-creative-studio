import { describe, expect, it } from "vitest";
import { AlgorithmError } from "../errors";
import {
  createRaster,
  getPixel,
  hashRaster,
  setPixel,
  type RasterImage
} from "../raster";
import { COLOR_VARIANTS, adjustColor, applyVariant, replaceColor } from "./color";

function pixel(rgba: readonly [number, number, number, number]): RasterImage {
  const image = createRaster(1, 1);
  setPixel(image, 0, 0, rgba);
  return image;
}

describe("adjustColor", () => {
  it("returns an independent copy when nothing changes", () => {
    const source = pixel([10, 20, 30, 255]);
    const output = adjustColor(source, {});
    expect(hashRaster(output)).toBe(hashRaster(source));
    expect(output.data).not.toBe(source.data);
  });

  it("applies brightness as a linear offset and clamps", () => {
    expect(getPixel(adjustColor(pixel([100, 100, 100, 255]), { brightness: 10 }), 0, 0)).toEqual([
      126, 126, 126, 255
    ]);
    expect(getPixel(adjustColor(pixel([250, 250, 250, 255]), { brightness: 100 }), 0, 0)).toEqual([
      255, 255, 255, 255
    ]);
    expect(getPixel(adjustColor(pixel([5, 5, 5, 255]), { brightness: -100 }), 0, 0)).toEqual([
      0, 0, 0, 255
    ]);
  });

  it("applies contrast around mid grey and leaves 128 unchanged", () => {
    expect(getPixel(adjustColor(pixel([128, 128, 128, 255]), { contrast: 50 }), 0, 0)).toEqual([
      128, 128, 128, 255
    ]);
    expect(getPixel(adjustColor(pixel([144, 144, 144, 255]), { contrast: 100 }), 0, 0)).toEqual([
      160, 160, 160, 255
    ]);
  });

  it("converts to greyscale at full negative saturation and keeps alpha", () => {
    const output = adjustColor(pixel([200, 100, 50, 123]), { saturation: -100 });
    expect(getPixel(output, 0, 0)).toEqual([124, 124, 124, 123]);
  });

  it("is deterministic and rejects out-of-range values", () => {
    const source = pixel([10, 90, 200, 255]);
    expect(hashRaster(adjustColor(source, { saturation: 40 }))).toBe(
      hashRaster(adjustColor(source, { saturation: 40 }))
    );
    expect(() => adjustColor(source, { brightness: 101 })).toThrow(AlgorithmError);
    expect(() => adjustColor(source, { contrast: Number.NaN })).toThrow(/有限数字/u);
  });
});

describe("replaceColor", () => {
  it("replaces exact matches and keeps everything else", () => {
    const source = createRaster(2, 1);
    setPixel(source, 0, 0, [255, 0, 0, 255]);
    setPixel(source, 1, 0, [0, 0, 255, 255]);
    const output = replaceColor(source, { from: [255, 0, 0], to: [0, 255, 0] });
    expect(getPixel(output, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(output, 1, 0)).toEqual([0, 0, 255, 255]);
  });

  it("respects the tolerance and preserves alpha", () => {
    const source = pixel([100, 100, 100, 88]);
    expect(getPixel(replaceColor(source, { from: [100, 100, 100], to: [1, 2, 3] }), 0, 0)).toEqual([
      1, 2, 3, 88
    ]);
    expect(
      getPixel(replaceColor(source, { from: [120, 120, 120], to: [1, 2, 3], tolerance: 19 }), 0, 0)
    ).toEqual([100, 100, 100, 88]);
    expect(
      getPixel(replaceColor(source, { from: [120, 120, 120], to: [1, 2, 3], tolerance: 20 }), 0, 0)
    ).toEqual([1, 2, 3, 88]);
  });

  it("rejects malformed colors", () => {
    expect(() => replaceColor(pixel([0, 0, 0, 255]), { from: [0, 0], to: [1, 1, 1] })).toThrow(
      /三个通道/u
    );
    expect(() =>
      replaceColor(pixel([0, 0, 0, 255]), {
        from: [0, 0, 0],
        to: [1, 1, 1],
        tolerance: Number.POSITIVE_INFINITY
      })
    ).toThrow(/有限数字/u);
  });
});

describe("color variants", () => {
  it("exposes unique presets starting with the original", () => {
    expect(COLOR_VARIANTS[0]?.id).toBe("original");
    expect(new Set(COLOR_VARIANTS.map((item) => item.id)).size).toBe(COLOR_VARIANTS.length);
    expect(
      COLOR_VARIANTS.every((item) => item.adjust.brightness >= -100 && item.adjust.brightness <= 100)
    ).toBe(true);
  });

  it("applies a known preset and leaves the source untouched for unknown ids", () => {
    const source = pixel([120, 120, 120, 255]);
    const damped = applyVariant(source, "muted");
    expect(getPixel(damped, 0, 0)).toEqual([120, 120, 120, 255]);
    expect(hashRaster(applyVariant(source, "unknown-id"))).toBe(hashRaster(source));
    expect(hashRaster(applyVariant(source, "bright"))).not.toBe(hashRaster(source));
  });

  it("keeps variants deterministic", () => {
    const source = pixel([10, 120, 240, 200]);
    expect(hashRaster(applyVariant(source, "deep"))).toBe(hashRaster(applyVariant(source, "deep")));
    expect(hashRaster(applyVariant(source, "warm"))).not.toBe(hashRaster(applyVariant(source, "cool")));
  });
});
