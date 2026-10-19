import { describe, expect, it } from "vitest";
import { AlgorithmError } from "../errors";
import { createRaster, getPixel, hashRaster, setPixel, type RasterImage } from "../raster";
import { buildPattern, patternFingerprint, planPatternRender } from "./pattern";

function dot(size = 8): RasterImage {
  const image = createRaster(size, size);
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      setPixel(image, x, y, [(x * 7) % 256, (y * 11) % 256, 128, 255]);
    }
  }
  return image;
}

describe("planPatternRender", () => {
  it("sizes the final output from the spec", () => {
    const plan = planPatternRender(dot(), { columns: 2, rows: 3, gapX: 4, gapY: 2 });
    expect(plan.mode).toBe("final");
    expect(plan.capped).toBe(false);
    expect(plan.effectiveScale).toBe(1);
    expect(plan.cellWidth).toBe(8);
    expect(plan.width).toBe(2 * 8 + 4);
    expect(plan.height).toBe(3 * 8 + 2 * 2);
    expect(plan.tileCount).toBe(6);
  });

  it("caps the preview to the preview budget and marks it capped", () => {
    const plan = planPatternRender(
      dot(64),
      { columns: 4, rows: 4 },
      { mode: "preview", previewMaxEdge: 200 }
    );
    expect(plan.mode).toBe("preview");
    expect(plan.capped).toBe(true);
    expect(plan.effectiveScale).toBeLessThan(1);
    expect(Math.max(plan.width, plan.height)).toBeLessThanOrEqual(200);
    expect(plan.cellWidth).toBeLessThan(64);
  });

  it("does not cap a preview that already fits", () => {
    const plan = planPatternRender(dot(4), { columns: 2, rows: 2 }, { mode: "preview" });
    expect(plan.capped).toBe(false);
    expect(plan.effectiveScale).toBe(1);
  });

  it("rejects a final output above the pixel budget instead of shrinking it", () => {
    expect(() =>
      planPatternRender(
        dot(64),
        { columns: 8, rows: 8, motifScale: 2 },
        { mode: "final", maxPixels: 100_000 }
      )
    ).toThrow(/超过上限/u);
  });

  it("rejects invalid specs and budgets", () => {
    expect(() => planPatternRender(dot(), { motifScale: 0 })).toThrow(AlgorithmError);
    expect(() => planPatternRender(dot(), { columns: 999 })).toThrow(AlgorithmError);
  });
});

describe("buildPattern", () => {
  it("produces a raster that matches the planned size", () => {
    const built = buildPattern(dot(), { columns: 2, rows: 2, gapX: 2 });
    expect(built.image.width).toBe(built.plan.width);
    expect(built.image.height).toBe(built.plan.height);
    expect(built.image.width).toBe(2 * 8 + 2);
    expect(getPixel(built.image, 1, 1)).toEqual([7, 11, 128, 255]);
  });

  it("is deterministic for the same input and parameters", () => {
    const first = buildPattern(dot(), { columns: 3, rows: 3, rotationDeg: 12, motifScale: 0.8 });
    const second = buildPattern(dot(), { columns: 3, rows: 3, rotationDeg: 12, motifScale: 0.8 });
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it("keeps the fingerprint stable across preview and final but differs per parameter set", () => {
    const preview = buildPattern(dot(), { columns: 2, rows: 2 }, { mode: "preview", previewMaxEdge: 10 });
    const final = buildPattern(dot(), { columns: 2, rows: 2 }, { mode: "final" });
    expect(preview.fingerprint).toBe(final.fingerprint);
    expect(preview.contentHash).not.toBe(final.contentHash);
    expect(preview.image.width).toBeLessThanOrEqual(final.image.width);

    const other = buildPattern(dot(), { columns: 2, rows: 2, gapX: 1 }, { mode: "final" });
    expect(other.fingerprint).not.toBe(final.fingerprint);

    const otherSource = buildPattern(dot(10), { columns: 2, rows: 2 }, { mode: "final" });
    expect(otherSource.fingerprint).not.toBe(final.fingerprint);
  });

  it("changes content when scale, rotation or color adjustment changes", () => {
    const base = buildPattern(dot(), { columns: 2, rows: 2 });
    const scaled = buildPattern(dot(), { columns: 2, rows: 2, motifScale: 0.5 });
    const rotated = buildPattern(dot(), { columns: 2, rows: 2, rotationDeg: 30 });
    const tinted = buildPattern(dot(), { columns: 2, rows: 2, adjust: { brightness: 20 } });
    expect(scaled.plan.cellWidth).toBe(4);
    expect(rotated.contentHash).not.toBe(base.contentHash);
    expect(tinted.contentHash).not.toBe(base.contentHash);
    expect(scaled.contentHash).not.toBe(base.contentHash);
  });

  it("keeps jitter reproducible through the seed", () => {
    const a = buildPattern(dot(), { columns: 2, rows: 2, jitter: 3, seed: 100 });
    const b = buildPattern(dot(), { columns: 2, rows: 2, jitter: 3, seed: 100 });
    const c = buildPattern(dot(), { columns: 2, rows: 2, jitter: 3, seed: 101 });
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).not.toBe(c.contentHash);
  });

  it("does not mutate the source image", () => {
    const source = dot();
    const before = hashRaster(source);
    buildPattern(source, { columns: 2, rows: 2, rotationDeg: 45, adjust: { saturation: 40 } });
    expect(hashRaster(source)).toBe(before);
  });

  it("exposes a fingerprint helper consistent with buildPattern", () => {
    const source = dot();
    expect(patternFingerprint(source, { columns: 2, rows: 2 })).toBe(
      buildPattern(source, { columns: 2, rows: 2 }).fingerprint
    );
  });
});
