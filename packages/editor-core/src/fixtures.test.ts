import { describe, expect, it } from "vitest";
import {
  BENCH_SIZES,
  FIXTURE_NAMES,
  FixtureError,
  addNoise,
  createFixture,
  createRandom,
  createRaster,
  fillChecker,
  fillGradient,
  fillRaster,
  fillTransparentBorder,
  getPixel,
  hashRaster,
  setPixel,
  type RasterImage
} from "./fixtures";

describe("raster fixtures", () => {
  it("creates a zeroed RGBA buffer of the requested size", () => {
    const image = createRaster(4, 3);
    expect(image.width).toBe(4);
    expect(image.height).toBe(3);
    expect(image.data.length).toBe(4 * 3 * 4);
    expect(Array.from(image.data).every((value) => value === 0)).toBe(true);
  });

  it("rejects invalid sizes instead of allocating", () => {
    expect(() => createRaster(0, 10)).toThrow(FixtureError);
    expect(() => createRaster(10, -1)).toThrow(FixtureError);
    expect(() => createRaster(10.5, 10)).toThrow(FixtureError);
    expect(() => createRaster(Number.NaN, 10)).toThrow(FixtureError);
    expect(() => createRaster(Number.POSITIVE_INFINITY, 10)).toThrow(FixtureError);
    expect(() => createRaster(10_000, 10_000)).toThrow(/超过上限/u);
  });

  it("reads and writes pixels with explicit bounds and channel validation", () => {
    const image = createRaster(2, 2);
    setPixel(image, 1, 1, [10, 20, 30, 40]);
    expect(getPixel(image, 1, 1)).toEqual([10, 20, 30, 40]);
    expect(() => getPixel(image, 2, 0)).toThrow(/越界/u);
    expect(() => getPixel(image, -1, 0)).toThrow(/越界/u);
    expect(() => setPixel(image, 0, 0, [0, 0, 0, 256])).toThrow(/颜色通道/u);
    expect(() => setPixel(image, 0, 0, [0, 0, 0, Number.NaN])).toThrow(/颜色通道/u);
  });

  it("fills the whole buffer with a solid colour", () => {
    const image = createRaster(3, 1);
    fillRaster(image, [7, 8, 9, 255]);
    expect(Array.from(image.data)).toEqual([7, 8, 9, 255, 7, 8, 9, 255, 7, 8, 9, 255]);
  });

  it("produces an alternating checker grid with the requested cell size", () => {
    const image = createRaster(4, 4);
    fillChecker(image, { cellSize: 2, colorA: [255, 255, 255], colorB: [0, 0, 0] });
    expect(getPixel(image, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(getPixel(image, 3, 0)).toEqual([0, 0, 0, 255]);
    expect(getPixel(image, 0, 3)).toEqual([0, 0, 0, 255]);
    expect(getPixel(image, 3, 3)).toEqual([255, 255, 255, 255]);
    expect(() => fillChecker(image, { cellSize: 0 })).toThrow(FixtureError);
  });

  it("builds deterministic gradients along the requested axis", () => {
    const horizontal = createRaster(3, 1);
    fillGradient(horizontal, { from: [0, 0, 0], to: [255, 255, 255], axis: "x" });
    expect(getPixel(horizontal, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(getPixel(horizontal, 1, 0)).toEqual([128, 128, 128, 255]);
    expect(getPixel(horizontal, 2, 0)).toEqual([255, 255, 255, 255]);

    const vertical = createRaster(1, 3);
    fillGradient(vertical, { from: [0, 0, 0], to: [255, 255, 255], axis: "y" });
    expect(getPixel(vertical, 0, 0)[1]).toBe(0);
    expect(getPixel(vertical, 0, 2)[1]).toBe(255);

    const diagonal = createRaster(2, 2);
    fillGradient(diagonal, { from: [0, 0, 0], to: [255, 255, 255], axis: "diagonal" });
    expect(getPixel(diagonal, 0, 0)[0]).toBe(0);
    expect(getPixel(diagonal, 1, 1)[0]).toBe(255);
  });

  it("adds reproducible noise for a given seed and repeats it exactly", () => {
    const make = () => {
      const image = createRaster(16, 16);
      fillChecker(image, { cellSize: 4, colorA: [128, 128, 128], colorB: [96, 96, 96] });
      addNoise(image, { seed: 7, amplitude: 16 });
      return image;
    };
    expect(hashRaster(make())).toBe(hashRaster(make()));

    const other = createRaster(16, 16);
    fillChecker(other, { cellSize: 4, colorA: [128, 128, 128], colorB: [96, 96, 96] });
    addNoise(other, { seed: 8, amplitude: 16 });
    expect(hashRaster(other)).not.toBe(hashRaster(make()));
  });

  it("keeps noise inside the channel range and rejects invalid amplitude", () => {
    const image = createRaster(8, 8);
    fillRaster(image, [250, 250, 250, 255]);
    addNoise(image, { seed: 1, amplitude: 255 });
    const values = Array.from(image.data).filter((_, index) => index % 4 !== 3);
    expect(values.every((value) => value >= 0 && value <= 255)).toBe(true);
    expect(() => addNoise(image, { seed: 1, amplitude: -1 })).toThrow(FixtureError);
    expect(() => addNoise(image, { seed: 1, amplitude: Number.NaN })).toThrow(FixtureError);
  });

  it("marks only the outer ring as transparent", () => {
    const image = createRaster(8, 8);
    fillTransparentBorder(image, { thickness: 2, opaque: [10, 20, 30] });
    expect(getPixel(image, 0, 0)[3]).toBe(0);
    expect(getPixel(image, 7, 7)[3]).toBe(0);
    expect(getPixel(image, 1, 4)[3]).toBe(0);
    expect(getPixel(image, 2, 4)).toEqual([10, 20, 30, 255]);
    expect(() => fillTransparentBorder(image, { thickness: 4 })).toThrow(FixtureError);
  });

  it("exposes a stable seeded pseudo random generator", () => {
    const first = createRandom(42);
    const second = createRandom(42);
    const values = Array.from({ length: 8 }, () => first());
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(Array.from({ length: 8 }, () => second())).toEqual(values);
    expect(createRandom(43)()).not.toBe(values[0]);
    expect(() => createRandom(Number.NaN)).toThrow(FixtureError);
  });

  it("hashes identical rasters identically and detects single pixel changes", () => {
    const first = createRaster(4, 4);
    const second = createRaster(4, 4);
    expect(hashRaster(first)).toBe(hashRaster(second));
    expect(hashRaster(first)).toContain("4x4:");
    setPixel(second, 3, 3, [1, 0, 0, 0]);
    expect(hashRaster(second)).not.toBe(hashRaster(first));
  });

  it("builds every named fixture deterministically with the declared size", () => {
    const expected: Record<string, [number, number]> = {
      "checker-tiny": [8, 8],
      "checker-medium": [256, 256],
      "gradient-small": [64, 64],
      "noise-medium": [256, 256],
      "alpha-border-small": [64, 64]
    };
    const hashes = new Set<string>();
    for (const name of FIXTURE_NAMES) {
      const fixture: RasterImage = createFixture(name);
      const size = expected[name] ?? [0, 0];
      expect([fixture.width, fixture.height]).toEqual(size);
      const again = createFixture(name);
      expect(hashRaster(again)).toBe(hashRaster(fixture));
      hashes.add(hashRaster(fixture));
    }
    expect(hashes.size).toBe(FIXTURE_NAMES.length);
    expect(FIXTURE_NAMES).toHaveLength(5);
  });

  it("keeps benchmark sizes ascending and inside the fixture limit", () => {
    for (let index = 1; index < BENCH_SIZES.length; index += 1) {
      expect(BENCH_SIZES[index]! > BENCH_SIZES[index - 1]!).toBe(true);
    }
    const largest = BENCH_SIZES[BENCH_SIZES.length - 1]!;
    expect(() => createRaster(largest, largest)).not.toThrow();
  });
});
