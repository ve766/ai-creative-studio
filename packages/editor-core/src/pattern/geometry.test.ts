import { describe, expect, it } from "vitest";
import { AlgorithmError } from "../errors";
import {
  createRaster,
  fillRaster,
  getPixel,
  hashRaster,
  setPixel,
  toRgba,
  type RasterImage,
  type Rgba
} from "../raster";
import { cropRaster, resizeRaster, rotateRaster } from "./geometry";

function solid(width: number, height: number, rgba: Rgba): RasterImage {
  const image = createRaster(width, height);
  fillRaster(image, rgba);
  return image;
}

describe("resizeRaster", () => {
  it("returns an equal but independent copy for the same size", () => {
    const source = solid(3, 2, toRgba([10, 20, 30], 200));
    const output = resizeRaster(source, 3, 2);
    expect(hashRaster(output)).toBe(hashRaster(source));
    expect(output.data).not.toBe(source.data);
  });

  it("averages exactly when halving", () => {
    const source = createRaster(2, 2);
    setPixel(source, 0, 0, [0, 0, 0, 255]);
    setPixel(source, 1, 0, [100, 100, 100, 255]);
    setPixel(source, 0, 1, [200, 200, 200, 255]);
    setPixel(source, 1, 1, [255, 255, 255, 255]);
    const output = resizeRaster(source, 1, 1);
    expect(getPixel(output, 0, 0)).toEqual([139, 139, 139, 255]);
  });

  it("keeps a constant image constant while upscaling", () => {
    const source = solid(1, 1, toRgba([7, 200, 90], 255));
    const output = resizeRaster(source, 4, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        expect(getPixel(output, x, y)).toEqual([7, 200, 90, 255]);
      }
    }
  });

  it("is deterministic and rejects invalid targets", () => {
    const source = solid(4, 4, toRgba([50, 60, 70], 255));
    expect(hashRaster(resizeRaster(source, 3, 5))).toBe(hashRaster(resizeRaster(source, 3, 5)));
    expect(() => resizeRaster(source, 0, 3)).toThrow(AlgorithmError);
    expect(() => resizeRaster(source, 2.5, 3)).toThrow(AlgorithmError);
    expect(() => resizeRaster(source, 10_000, 10_000)).toThrow(/超过上限/u);
  });
});

describe("rotateRaster", () => {
  it("rotates a 2x2 image by 90 degrees exactly", () => {
    const source = createRaster(2, 2);
    setPixel(source, 0, 0, [255, 0, 0, 255]);
    setPixel(source, 1, 0, [0, 255, 0, 255]);
    setPixel(source, 0, 1, [0, 0, 255, 255]);
    setPixel(source, 1, 1, [255, 255, 0, 255]);
    const output = rotateRaster(source, 90);
    expect(output.width).toBe(2);
    expect(getPixel(output, 1, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(output, 1, 1)).toEqual([0, 255, 0, 255]);
    expect(getPixel(output, 0, 1)).toEqual([255, 255, 0, 255]);
    expect(getPixel(output, 0, 0)).toEqual([0, 0, 255, 255]);
  });

  it("keeps the image unchanged at zero degrees and is deterministic", () => {
    const source = solid(5, 3, toRgba([12, 34, 56], 255));
    expect(hashRaster(rotateRaster(source, 0))).toBe(hashRaster(source));
    expect(hashRaster(rotateRaster(source, 37))).toBe(hashRaster(rotateRaster(source, 37)));
  });

  it("expands the canvas to fit the rotated bounds when asked", () => {
    const source = solid(4, 2, toRgba([1, 2, 3], 255));
    const output = rotateRaster(source, 90, { expand: true });
    expect(output.width).toBe(2);
    expect(output.height).toBe(4);
  });

  it("rejects invalid angles", () => {
    const source = solid(4, 4, toRgba([1, 2, 3], 255));
    expect(() => rotateRaster(source, Number.NaN)).toThrow(AlgorithmError);
    expect(() => rotateRaster(source, 400)).toThrow(/360/u);
    expect(() => rotateRaster(source, Number.POSITIVE_INFINITY)).toThrow(AlgorithmError);
  });
});

describe("cropRaster", () => {
  it("copies the requested region", () => {
    const source = createRaster(4, 4);
    setPixel(source, 1, 1, [9, 9, 9, 255]);
    setPixel(source, 2, 2, [5, 5, 5, 255]);
    const output = cropRaster(source, { x: 1, y: 1, width: 2, height: 2 });
    expect(output.width).toBe(2);
    expect(getPixel(output, 0, 0)).toEqual([9, 9, 9, 255]);
    expect(getPixel(output, 1, 1)).toEqual([5, 5, 5, 255]);
  });

  it("rejects regions outside the image and invalid sizes", () => {
    const source = solid(4, 4, toRgba([0, 0, 0], 255));
    expect(() => cropRaster(source, { x: 3, y: 0, width: 2, height: 1 })).toThrow(/超出/u);
    expect(() => cropRaster(source, { x: -1, y: 0, width: 2, height: 1 })).toThrow(/超出/u);
    expect(() => cropRaster(source, { x: 0, y: 0, width: 0, height: 1 })).toThrow(AlgorithmError);
    expect(() => cropRaster(source, { x: 0.5, y: 0, width: 1, height: 1 })).toThrow(/整数/u);
  });
});
