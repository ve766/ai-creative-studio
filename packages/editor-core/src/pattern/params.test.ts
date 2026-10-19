import { describe, expect, it } from "vitest";
import { AlgorithmError } from "../errors";
import {
  DEFAULT_PREVIEW_MAX_EDGE,
  DEFAULT_SEED,
  MAX_GAP,
  MAX_MOTIF_SCALE,
  MAX_TILE_COUNT,
  normalizeArrange,
  normalizeColorAdjust,
  normalizeColorReplace,
  normalizeMirrorTile,
  normalizePatternSpec,
  normalizeRenderBudget,
  normalizeTileRepeat
} from "./params";

function expectInvalidParam(run: () => unknown, expected?: RegExp): void {
  try {
    run();
    throw new Error("expected an AlgorithmError but nothing was thrown");
  } catch (error) {
    expect(error).toBeInstanceOf(AlgorithmError);
    expect((error as AlgorithmError).code).toBe("INVALID_PARAM");
    if (expected) expect((error as AlgorithmError).message).toMatch(expected);
  }
}

describe("pattern params", () => {
  it("applies documented defaults", () => {
    expect(normalizeTileRepeat()).toEqual({ columns: 2, rows: 2 });
    expect(normalizeMirrorTile()).toEqual({ columns: 2, rows: 2, mode: "both" });
    const arrange = normalizeArrange();
    expect(arrange).toMatchObject({
      columns: 3,
      rows: 3,
      pattern: "grid",
      gapX: 0,
      gapY: 0,
      jitter: 0,
      seed: DEFAULT_SEED
    });
    expect(normalizeColorAdjust()).toEqual({ brightness: 0, contrast: 0, saturation: 0 });
    expect(normalizePatternSpec()).toMatchObject({ motifScale: 1, rotationDeg: 0 });
  });

  it("normalizes the boundaries of every integer range", () => {
    expect(normalizeTileRepeat({ columns: 1, rows: 1 })).toEqual({ columns: 1, rows: 1 });
    expect(normalizeTileRepeat({ columns: MAX_TILE_COUNT, rows: MAX_TILE_COUNT })).toEqual({
      columns: MAX_TILE_COUNT,
      rows: MAX_TILE_COUNT
    });
    expect(normalizeArrange({ gapX: MAX_GAP, gapY: MAX_GAP }).gapX).toBe(MAX_GAP);
    expect(normalizePatternSpec({ motifScale: MAX_MOTIF_SCALE }).motifScale).toBe(MAX_MOTIF_SCALE);
  });

  it("rejects NaN, Infinity, non-integers and out-of-range values", () => {
    expectInvalidParam(() => normalizeTileRepeat({ columns: Number.NaN }), /正整数|整数/u);
    expectInvalidParam(() => normalizeTileRepeat({ rows: Number.POSITIVE_INFINITY }), /整数/u);
    expectInvalidParam(() => normalizeTileRepeat({ columns: 2.5 }), /整数/u);
    expectInvalidParam(() => normalizeTileRepeat({ columns: 0 }), /1-64/u);
    expectInvalidParam(() => normalizeTileRepeat({ columns: MAX_TILE_COUNT + 1 }), /1-64/u);
    expectInvalidParam(() => normalizeArrange({ gapX: -1 }), /0-4096/u);
    expectInvalidParam(() => normalizeArrange({ jitter: Number.NaN }), /整数/u);
    expectInvalidParam(() => normalizeColorAdjust({ brightness: Number.NaN }), /有限数字/u);
    expectInvalidParam(() => normalizeColorAdjust({ contrast: Number.POSITIVE_INFINITY }), /有限数字/u);
    expectInvalidParam(() => normalizeColorAdjust({ saturation: 101 }), /-100-100/u);
    expectInvalidParam(() => normalizePatternSpec({ motifScale: 0.001 }), /0.02-8/u);
    expectInvalidParam(() => normalizePatternSpec({ motifScale: Number.NaN }), /有限数字/u);
    expectInvalidParam(() => normalizePatternSpec({ rotationDeg: 181 }), /-180-180/u);
  });

  it("rejects unknown enum values instead of silently falling back", () => {
    expectInvalidParam(() => normalizeMirrorTile({ mode: "diagonal" }), /镜像模式/u);
    expectInvalidParam(() => normalizeArrange({ pattern: "spiral" }), /排列方式/u);
  });

  it("validates color replacement triplets and tolerance", () => {
    expect(normalizeColorReplace({ from: [0, 0, 0], to: [255, 255, 255], tolerance: 10 })).toEqual({
      from: [0, 0, 0],
      to: [255, 255, 255],
      tolerance: 10
    });
    expectInvalidParam(() => normalizeColorReplace({ from: [0, 0], to: [1, 1, 1] }), /三个通道/u);
    expectInvalidParam(
      () => normalizeColorReplace({ from: [0, 0, 256], to: [1, 1, 1] }),
      /源颜色 B/u
    );
    expectInvalidParam(
      () => normalizeColorReplace({ from: [0, 0, 0], to: [1, 1, 1], tolerance: 256 }),
      /0-255/u
    );
  });

  it("normalizes render budgets with explicit rejections", () => {
    expect(normalizeRenderBudget({ mode: "preview" }, 1000)).toEqual({
      mode: "preview",
      previewMaxEdge: DEFAULT_PREVIEW_MAX_EDGE,
      maxPixels: 1000
    });
    expect(normalizeRenderBudget({ mode: "final", maxPixels: 5000 }, 1000)).toEqual({
      mode: "final",
      previewMaxEdge: DEFAULT_PREVIEW_MAX_EDGE,
      maxPixels: 5000
    });
    expectInvalidParam(
      () => normalizeRenderBudget({ mode: "thumbnail" as "preview" }, 1000),
      /preview \/ final/u
    );
    expectInvalidParam(
      () => normalizeRenderBudget({ mode: "preview", previewMaxEdge: 0 }, 1000),
      /正整数/u
    );
  });
});
