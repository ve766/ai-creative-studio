import { describe, expect, it } from "vitest";
import { AlgorithmError } from "../errors";
import {
  createRaster,
  getPixel,
  hashRaster,
  setPixel,
  toRgba,
  type RasterImage
} from "../raster";
import { arrangeMotif, planArrange, planArrangeLayout } from "./arrange";
import { normalizeArrange } from "./params";

function dot(): RasterImage {
  const image = createRaster(4, 4);
  setPixel(image, 1, 1, [255, 0, 0, 255]);
  setPixel(image, 2, 1, [255, 0, 0, 255]);
  setPixel(image, 1, 2, [255, 0, 0, 255]);
  setPixel(image, 2, 2, [255, 0, 0, 255]);
  return image;
}

describe("planArrange", () => {
  it("sizes a plain grid as columns x rows with gaps", () => {
    const plan = planArrange(dot(), { columns: 3, rows: 2, gapX: 5, gapY: 7 });
    expect(plan.canvasWidth).toBe(3 * 4 + 2 * 5);
    expect(plan.canvasHeight).toBe(2 * 4 + 1 * 7);
    expect(plan.placements).toHaveLength(6);
    expect(plan.placements[1]).toEqual({ x: 9, y: 0 });
  });

  it("adds a half-cell stagger for half-drop rows", () => {
    const plan = planArrange(dot(), { columns: 2, rows: 2, pattern: "half-drop" });
    expect(plan.canvasWidth).toBe(2 * 4 + 2);
    expect(plan.placements[2]).toEqual({ x: 2, y: 4 });
    expect(plan.placements[3]).toEqual({ x: 4 + 2, y: 4 });
  });

  it("adds a half-cell vertical stagger for offset columns", () => {
    const plan = planArrange(dot(), { columns: 2, rows: 2, pattern: "offset" });
    expect(plan.canvasHeight).toBe(2 * 4 + 2);
    expect(plan.placements[1]).toEqual({ x: 4, y: 2 });
  });

  it("is deterministic for a fixed seed and varies with the seed", () => {
    const a = planArrange(dot(), { columns: 2, rows: 2, jitter: 3, seed: 7 });
    const b = planArrange(dot(), { columns: 2, rows: 2, jitter: 3, seed: 7 });
    const c = planArrange(dot(), { columns: 2, rows: 2, jitter: 3, seed: 8 });
    expect(a.placements).toEqual(b.placements);
    expect(a.placements).not.toEqual(c.placements);
  });

  it("rejects invalid arrangements", () => {
    expect(() => planArrange(dot(), { columns: 0 })).toThrow(AlgorithmError);
    expect(() => planArrange(dot(), { pattern: "spiral" })).toThrow(/排列方式/u);
  });
});

describe("arrangeMotif", () => {
  it("places the motif at every grid position", () => {
    const output = arrangeMotif(dot(), { columns: 2, rows: 2 });
    expect(output.width).toBe(8);
    expect(output.height).toBe(8);
    expect(getPixel(output, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(getPixel(output, 5, 1)).toEqual([255, 0, 0, 255]);
    expect(getPixel(output, 1, 5)).toEqual([255, 0, 0, 255]);
    expect(getPixel(output, 5, 5)).toEqual([255, 0, 0, 255]);
    expect(getPixel(output, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("keeps gaps transparent and is deterministic", () => {
    const output = arrangeMotif(dot(), { columns: 2, rows: 2, gapX: 4, gapY: 4 });
    expect(getPixel(output, 4, 0)).toEqual([0, 0, 0, 0]);
    expect(hashRaster(arrangeMotif(dot(), { columns: 2, rows: 2, gapX: 4 }))).toBe(
      hashRaster(arrangeMotif(dot(), { columns: 2, rows: 2, gapX: 4 }))
    );
  });

  it("composites overlapping motifs with alpha instead of replacing", () => {
    const canvas = createRaster(4, 4);
    setPixel(canvas, 0, 0, [0, 0, 255, 255]);
    const motif = createRaster(2, 2);
    setPixel(motif, 0, 0, [255, 0, 0, 128]);
    const output = arrangeMotif(motif, { columns: 1, rows: 1 });
    expect(getPixel(output, 0, 0)).toEqual([255, 0, 0, 128]);
  });

  it("supports jitter within the padded canvas", () => {
    const withJitter = arrangeMotif(dot(), { columns: 2, rows: 2, jitter: 3, seed: 42 });
    const withoutJitter = arrangeMotif(dot(), { columns: 2, rows: 2 });
    expect(withJitter.width).toBe(withoutJitter.width + 6);
    expect(hashRaster(withJitter)).not.toBe(hashRaster(withoutJitter));
  });
});

describe("planArrangeLayout", () => {
  it("computes a layout without needing pixel data", () => {
    const layout = planArrangeLayout(10, 20, normalizeArrange({ columns: 2, rows: 2 }));
    expect(layout.canvasWidth).toBe(20);
    expect(layout.canvasHeight).toBe(40);
    expect(layout.placements).toHaveLength(4);
  });

  it("rejects non-positive cell sizes", () => {
    expect(() => planArrangeLayout(0, 10, normalizeArrange())).toThrow(AlgorithmError);
  });
});

describe("alpha compositing baseline", () => {
  it("keeps opaque source pixels when the target is transparent", () => {
    const motif = createRaster(1, 1);
    setPixel(motif, 0, 0, [10, 20, 30, 255]);
    const output = arrangeMotif(motif, { columns: 1, rows: 1 });
    expect(getPixel(output, 0, 0)).toEqual([10, 20, 30, 255]);
  });

  it("ignores fully transparent motif pixels", () => {
    const motif = createRaster(1, 1);
    setPixel(motif, 0, 0, toRgba([10, 20, 30], 0));
    const output = arrangeMotif(motif, { columns: 1, rows: 1 });
    expect(getPixel(output, 0, 0)).toEqual([0, 0, 0, 0]);
  });
});
