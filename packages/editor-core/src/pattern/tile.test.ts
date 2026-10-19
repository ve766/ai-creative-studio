import { describe, expect, it } from "vitest";
import { AlgorithmError } from "../errors";
import {
  createRaster,
  fillRaster,
  getPixel,
  hashRaster,
  setPixel,
  toRgba,
  type RasterImage
} from "../raster";
import { mirrorTile, offsetWrap, repeatTile } from "./tile";

function quadrants(): RasterImage {
  const image = createRaster(2, 2);
  setPixel(image, 0, 0, [255, 0, 0, 255]);
  setPixel(image, 1, 0, [0, 255, 0, 255]);
  setPixel(image, 0, 1, [0, 0, 255, 255]);
  setPixel(image, 1, 1, [255, 255, 0, 255]);
  return image;
}

describe("repeatTile", () => {
  it("repeats the motif in both directions", () => {
    const output = repeatTile(quadrants(), { columns: 2, rows: 2 });
    expect(output.width).toBe(4);
    expect(output.height).toBe(4);
    expect(getPixel(output, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(output, 2, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(output, 3, 3)).toEqual([255, 255, 0, 255]);
    expect(getPixel(output, 1, 2)).toEqual([0, 255, 0, 255]);
  });

  it("returns an identical image for a 1x1 grid and stays deterministic", () => {
    const source = quadrants();
    expect(hashRaster(repeatTile(source, { columns: 1, rows: 1 }))).toBe(hashRaster(source));
    expect(hashRaster(repeatTile(source, { columns: 3, rows: 2 }))).toBe(
      hashRaster(repeatTile(source, { columns: 3, rows: 2 }))
    );
  });

  it("rejects invalid tile counts and oversized outputs", () => {
    const source = quadrants();
    expect(() => repeatTile(source, { columns: 0 })).toThrow(AlgorithmError);
    expect(() => repeatTile(source, { rows: 65 })).toThrow(/1-64/u);
    const big = createRaster(2048, 2048);
    fillRaster(big, toRgba([1, 2, 3], 255));
    expect(() => repeatTile(big, { columns: 4, rows: 4 })).toThrow(/超过上限/u);
  });
});

describe("mirrorTile", () => {
  it("mirrors alternate columns horizontally", () => {
    const output = mirrorTile(quadrants(), { columns: 2, rows: 1, mode: "horizontal" });
    expect(getPixel(output, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(output, 1, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(output, 2, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(output, 3, 0)).toEqual([255, 0, 0, 255]);
  });

  it("mirrors alternate rows vertically", () => {
    const output = mirrorTile(quadrants(), { columns: 1, rows: 2, mode: "vertical" });
    expect(getPixel(output, 0, 2)).toEqual([0, 0, 255, 255]);
    expect(getPixel(output, 0, 3)).toEqual([255, 0, 0, 255]);
  });

  it("applies both flips for the both mode", () => {
    const output = mirrorTile(quadrants(), { columns: 2, rows: 2, mode: "both" });
    expect(getPixel(output, 3, 3)).toEqual([255, 0, 0, 255]);
    expect(getPixel(output, 2, 2)).toEqual([255, 255, 0, 255]);
  });

  it("rejects unknown modes", () => {
    expect(() => mirrorTile(quadrants(), { mode: "diagonal" })).toThrow(/镜像模式/u);
  });
});

describe("offsetWrap", () => {
  it("wraps content around the edges", () => {
    const source = createRaster(4, 1);
    for (let x = 0; x < 4; x += 1) setPixel(source, x, 0, [x * 10, 0, 0, 255]);
    const output = offsetWrap(source, 1, 0);
    expect(getPixel(output, 0, 0)).toEqual([30, 0, 0, 255]);
    expect(getPixel(output, 1, 0)).toEqual([0, 0, 0, 255]);
  });

  it("is identity for a full-width shift and normalizes negative shifts", () => {
    const source = quadrants();
    expect(hashRaster(offsetWrap(source, 2, 2))).toBe(hashRaster(source));
    expect(hashRaster(offsetWrap(source, -1, 0))).toBe(hashRaster(offsetWrap(source, 1, 0)));
  });

  it("rejects non-finite offsets", () => {
    expect(() => offsetWrap(quadrants(), Number.NaN, 0)).toThrow(AlgorithmError);
    expect(() => offsetWrap(quadrants(), 0, Number.POSITIVE_INFINITY)).toThrow(/有限数字/u);
  });
});
